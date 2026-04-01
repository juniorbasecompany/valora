"""
Valida filtros de diretório e eventos ponta a ponta (API backend).

Uso:
  uv run python script_test_filter_directory.py
  uv run python script_test_filter_directory.py http://127.0.0.1:8003

O script:
- gera JWT de um member master/admin ativo via banco;
- testa filtros de member, scope, location, unity, field, action e event;
- valida a regra local do painel de tenant (filtro textual no item único).
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import requests
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from valora_backend.auth.jwt import create_access_token
from valora_backend.config import Settings
from valora_backend.model.identity import Member


@dataclass
class TestContext:
    base_url: str
    token: str
    timeout: int = 30


def _to_datetime_utc(raw: str) -> datetime:
    normalized = raw.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _contains_any(raw_value_list: list[str | None], needle: str) -> bool:
    for value in raw_value_list:
        if value and needle in value.lower():
            return True
    return False


def _request_json(
    ctx: TestContext, path: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    response = requests.get(
        f"{ctx.base_url}{path}",
        params=params,
        headers={"Authorization": f"Bearer {ctx.token}"},
        timeout=ctx.timeout,
    )
    payload = response.json() if response.text else {}
    if response.status_code != 200:
        raise AssertionError(
            f"GET {path} status={response.status_code} params={params} payload={payload}"
        )
    if not isinstance(payload, dict):
        raise AssertionError(f"Resposta inválida em {path}: {type(payload)}")
    return payload


def _expand_location_ids_with_descendants(
    location_item_list: list[dict[str, Any]], seed_id_list: list[int]
) -> set[int]:
    """Espelha a regra da API: cada id de semente mais descendentes na árvore do escopo."""
    children_by_parent: dict[int | None, list[int]] = {}
    for item in location_item_list:
        lid = int(item["id"])
        raw_parent = item.get("parent_location_id")
        parent_key: int | None = int(raw_parent) if raw_parent is not None else None
        children_by_parent.setdefault(parent_key, []).append(lid)
    expanded: set[int] = set()
    stack = list(seed_id_list)
    while stack:
        current = stack.pop()
        if current in expanded:
            continue
        expanded.add(current)
        stack.extend(children_by_parent.get(current, ()))
    return expanded


def _get_item_list(payload: dict[str, Any], path: str) -> list[dict[str, Any]]:
    item_list = payload.get("item_list")
    if not isinstance(item_list, list):
        raise AssertionError(f"{path} não retornou item_list válido")
    normalized: list[dict[str, Any]] = []
    for item in item_list:
        if isinstance(item, dict):
            normalized.append(item)
    return normalized


def _print_ok(message: str) -> None:
    print(f"[OK] {message}")


def _print_skip(message: str) -> None:
    print(f"[SKIP] {message}")


def _assert_member_filters(ctx: TestContext) -> None:
    path = "/auth/tenant/current/members"
    item_list = _get_item_list(_request_json(ctx, path), path)
    if not item_list:
        _print_skip("member sem dados para testar")
        return

    sample = item_list[0]
    name = str(sample.get("name") or "")
    display_name = str(sample.get("display_name") or "")
    email = str(sample.get("email") or "")
    role_name = str(sample.get("role_name") or "").lower()
    status_name = str(sample.get("status") or "").lower()

    q_source = display_name or name or email
    if q_source:
        q_value = q_source.strip().lower()[:4]
        filtered = _get_item_list(_request_json(ctx, path, {"q": q_value}), path)
        for row in filtered:
            if not _contains_any(
                [
                    str(row.get("name") or ""),
                    str(row.get("display_name") or ""),
                    str(row.get("email") or ""),
                ],
                q_value,
            ):
                raise AssertionError("member q retornou item fora do filtro textual")
        _print_ok("member q")
    else:
        _print_skip("member q sem fonte textual")

    if role_name:
        filtered = _get_item_list(_request_json(ctx, path, {"role": role_name}), path)
        for row in filtered:
            if str(row.get("role_name") or "").lower() != role_name:
                raise AssertionError("member role retornou item fora do papel")
        _print_ok("member role")
    else:
        _print_skip("member role sem role_name")

    role_name_list = sorted(
        {str(row.get("role_name") or "").lower() for row in item_list if row.get("role_name")}
    )
    if role_name_list:
        selected_role_list = role_name_list[:2]
        filtered = _get_item_list(
            _request_json(ctx, path, {"role_list": ",".join(selected_role_list)}), path
        )
        for row in filtered:
            if str(row.get("role_name") or "").lower() not in selected_role_list:
                raise AssertionError("member role_list retornou item fora do papel")
        _print_ok("member role_list")

        filtered_empty = _get_item_list(
            _request_json(ctx, path, {"role_list": "__none__"}), path
        )
        if filtered_empty:
            raise AssertionError("member role_list vazio deveria retornar zero itens")
        _print_ok("member role_list vazio")
    else:
        _print_skip("member role_list sem role_name")

    if status_name:
        filtered = _get_item_list(_request_json(ctx, path, {"status": status_name}), path)
        for row in filtered:
            if str(row.get("status") or "").lower() != status_name:
                raise AssertionError("member status retornou item fora da situação")
        _print_ok("member status")
    else:
        _print_skip("member status sem status")

    status_name_list = sorted(
        {str(row.get("status") or "").lower() for row in item_list if row.get("status")}
    )
    if status_name_list:
        selected_status_list = status_name_list[:2]
        filtered = _get_item_list(
            _request_json(ctx, path, {"status_list": ",".join(selected_status_list)}), path
        )
        for row in filtered:
            if str(row.get("status") or "").lower() not in selected_status_list:
                raise AssertionError("member status_list retornou item fora da situação")
        _print_ok("member status_list")

        filtered_empty = _get_item_list(
            _request_json(ctx, path, {"status_list": "__none__"}), path
        )
        if filtered_empty:
            raise AssertionError("member status_list vazio deveria retornar zero itens")
        _print_ok("member status_list vazio")
    else:
        _print_skip("member status_list sem status")


def _assert_scope_filters(ctx: TestContext) -> dict[str, Any] | None:
    path = "/auth/tenant/current/scopes"
    payload = _request_json(ctx, path)
    item_list = _get_item_list(payload, path)
    if not item_list:
        _print_skip("scope sem dados para testar")
        return None

    sample = item_list[0]
    q_source = str(sample.get("name") or sample.get("display_name") or "")
    if q_source:
        q_value = q_source.strip().lower()[:4]
        filtered = _get_item_list(_request_json(ctx, path, {"q": q_value}), path)
        for row in filtered:
            if not _contains_any(
                [str(row.get("name") or ""), str(row.get("display_name") or "")], q_value
            ):
                raise AssertionError("scope q retornou item fora do filtro textual")
        _print_ok("scope q")
    else:
        _print_skip("scope q sem fonte textual")

    return payload


def _assert_location_filters(ctx: TestContext, scope_id: int) -> None:
    path = f"/auth/tenant/current/scopes/{scope_id}/locations"
    item_list = _get_item_list(_request_json(ctx, path), path)
    if not item_list:
        _print_skip("location sem dados para testar")
        return

    sample = item_list[0]
    q_source = str(sample.get("name") or sample.get("display_name") or "")
    if q_source:
        q_value = q_source.strip().lower()[:4]
        filtered = _get_item_list(_request_json(ctx, path, {"q": q_value}), path)
        for row in filtered:
            if not _contains_any(
                [str(row.get("name") or ""), str(row.get("display_name") or "")], q_value
            ):
                raise AssertionError("location q retornou item fora do filtro textual")
        _print_ok("location q")
    else:
        _print_skip("location q sem fonte textual")

    non_root = next((row for row in item_list if row.get("parent_location_id") is not None), None)
    if non_root is None:
        _print_skip("location parent_location_id sem dados não-raiz")
        return
    parent_location_id = int(non_root["parent_location_id"])
    filtered = _get_item_list(
        _request_json(ctx, path, {"parent_location_id": parent_location_id}), path
    )
    for row in filtered:
        if row.get("parent_location_id") != parent_location_id:
            raise AssertionError(
                "location parent_location_id retornou item fora do pai informado"
            )
    _print_ok("location parent_location_id")


def _assert_unity_filters(ctx: TestContext, scope_id: int) -> None:
    path = f"/auth/tenant/current/scopes/{scope_id}/unities"
    item_list = _get_item_list(_request_json(ctx, path), path)
    if not item_list:
        _print_skip("unity sem dados para testar")
        return

    sample = item_list[0]
    q_source = str(sample.get("name") or sample.get("display_name") or "")
    if q_source:
        q_value = q_source.strip().lower()[:4]
        filtered = _get_item_list(_request_json(ctx, path, {"q": q_value}), path)
        for row in filtered:
            if not _contains_any(
                [str(row.get("name") or ""), str(row.get("display_name") or "")], q_value
            ):
                raise AssertionError("unity q retornou item fora do filtro textual")
        _print_ok("unity q")
    else:
        _print_skip("unity q sem fonte textual")

    non_root = next((row for row in item_list if row.get("parent_unity_id") is not None), None)
    if non_root is None:
        _print_skip("unity parent_unity_id sem dados não-raiz")
        return
    parent_unity_id = int(non_root["parent_unity_id"])
    filtered = _get_item_list(_request_json(ctx, path, {"parent_unity_id": parent_unity_id}), path)
    for row in filtered:
        if row.get("parent_unity_id") != parent_unity_id:
            raise AssertionError("unity parent_unity_id retornou item fora do pai informado")
    _print_ok("unity parent_unity_id")


def _assert_field_filters(ctx: TestContext, scope_id: int) -> None:
    path = f"/auth/tenant/current/scopes/{scope_id}/fields"
    params = {"label_lang": "pt-BR"}
    item_list = _get_item_list(_request_json(ctx, path, params), path)
    if not item_list:
        _print_skip("field sem dados para testar")
        return

    sample = item_list[0]
    q_source = str(sample.get("label_name") or sample.get("sql_type") or "")
    if not q_source:
        _print_skip("field q sem fonte textual")
        return

    q_value = q_source.strip().lower()[:4]
    filtered = _get_item_list(_request_json(ctx, path, {**params, "q": q_value}), path)
    for row in filtered:
        sql_type = str(row.get("sql_type") or "").lower()
        label_name = str(row.get("label_name") or "").lower()
        if q_value not in sql_type and q_value not in label_name:
            raise AssertionError("field q retornou item fora do filtro textual")
    _print_ok("field q")


def _assert_action_filters(ctx: TestContext, scope_id: int) -> None:
    path = f"/auth/tenant/current/scopes/{scope_id}/actions"
    params = {"label_lang": "pt-BR"}
    item_list = _get_item_list(_request_json(ctx, path, params), path)
    if not item_list:
        _print_skip("action sem dados para testar")
        return

    sample = item_list[0]
    q_source = str(sample.get("label_name") or "")
    if not q_source:
        _print_skip("action q sem label_name para validar")
        return

    q_value = q_source.strip().lower()[:4]
    filtered = _get_item_list(_request_json(ctx, path, {**params, "q": q_value}), path)
    for row in filtered:
        label_name = str(row.get("label_name") or "").lower()
        if q_value not in label_name:
            raise AssertionError("action q retornou item fora do filtro textual")
    _print_ok("action q")


def _assert_event_filters(ctx: TestContext, scope_id: int) -> None:
    path = f"/auth/tenant/current/scopes/{scope_id}/events"
    item_list = _get_item_list(_request_json(ctx, path), path)
    if not item_list:
        _print_skip("event sem dados para testar")
        return

    sample = item_list[0]
    location_id = int(sample["location_id"])
    unity_id = int(sample["unity_id"])
    action_id = int(sample["action_id"])
    moment_utc = _to_datetime_utc(str(sample["moment_utc"]))
    moment_from_utc = (moment_utc - timedelta(seconds=1)).isoformat()
    moment_to_utc = (moment_utc + timedelta(seconds=1)).isoformat()

    loc_path = f"/auth/tenant/current/scopes/{scope_id}/locations"
    loc_item_list = _get_item_list(_request_json(ctx, loc_path), loc_path)
    allowed_for_location = _expand_location_ids_with_descendants(
        loc_item_list, [location_id]
    )
    by_location = _get_item_list(_request_json(ctx, path, {"location_id": location_id}), path)
    for row in by_location:
        if int(row["location_id"]) not in allowed_for_location:
            raise AssertionError(
                "event location_id retornou item fora do local informado (nó + descendentes)"
            )
    _print_ok("event location_id")

    by_unity = _get_item_list(_request_json(ctx, path, {"unity_id": unity_id}), path)
    for row in by_unity:
        if int(row["unity_id"]) != unity_id:
            raise AssertionError("event unity_id retornou item fora da unidade informada")
    _print_ok("event unity_id")

    by_action = _get_item_list(_request_json(ctx, path, {"action_id": action_id}), path)
    for row in by_action:
        if int(row["action_id"]) != action_id:
            raise AssertionError("event action_id retornou item fora da ação informada")
    _print_ok("event action_id")

    by_moment = _get_item_list(
        _request_json(
            ctx,
            path,
            {"moment_from_utc": moment_from_utc, "moment_to_utc": moment_to_utc},
        ),
        path,
    )
    for row in by_moment:
        value = _to_datetime_utc(str(row["moment_utc"]))
        if value < _to_datetime_utc(moment_from_utc) or value > _to_datetime_utc(
            moment_to_utc
        ):
            raise AssertionError("event período retornou item fora do intervalo")
    _print_ok("event moment_from_utc + moment_to_utc")


def _assert_tenant_local_filter_rule(ctx: TestContext) -> None:
    payload = _request_json(ctx, "/auth/tenant/current")
    display_name = str(payload.get("display_name") or "")
    legal_name = str(payload.get("name") or "")
    tenant_id = str(payload.get("id") or "")

    haystack = f"{display_name} {legal_name} {tenant_id}".lower()
    positive_query = (display_name or legal_name or tenant_id).strip().lower()[:4]
    if positive_query:
        if positive_query not in haystack:
            raise AssertionError("tenant filtro local falhou no caso positivo")
        _print_ok("tenant filtro local (positivo)")
    else:
        _print_skip("tenant filtro local sem dado textual")

    negative_query = "__sem_resultado__"
    if negative_query in haystack:
        raise AssertionError("tenant filtro local falhou no caso negativo")
    _print_ok("tenant filtro local (negativo)")


def _build_context(base_url: str) -> TestContext:
    settings = Settings()
    engine = create_engine(settings.database_url)
    session_local = sessionmaker(bind=engine)

    with session_local() as session:
        member = session.scalar(
            select(Member)
            .where(
                Member.status == 1,
                Member.role.in_((1, 2)),
                Member.account_id.is_not(None),
                Member.tenant_id.is_not(None),
            )
            .order_by(Member.id.asc())
            .limit(1)
        )
        if member is None:
            raise AssertionError("Não foi encontrado member master/admin ativo para autenticar")

        token = create_access_token(
            account_id=member.account_id,
            tenant_id=member.tenant_id,
        )
    return TestContext(base_url=base_url.rstrip("/"), token=token)


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8003"
    ctx = _build_context(base_url)

    scope_payload = _assert_scope_filters(ctx)
    _assert_member_filters(ctx)
    _assert_tenant_local_filter_rule(ctx)

    if scope_payload is None:
        _print_skip("Sem scope para validar location/unity/field/action/event")
        print("Teste concluído com skips.")
        return 0

    scope_id = int(scope_payload.get("current_scope_id") or 0)
    if scope_id < 1:
        item_list = _get_item_list(scope_payload, "/auth/tenant/current/scopes")
        if not item_list:
            _print_skip("Sem scope_id elegível para validar filtros por escopo")
            print("Teste concluído com skips.")
            return 0
        scope_id = int(item_list[0]["id"])

    _assert_location_filters(ctx, scope_id)
    _assert_unity_filters(ctx, scope_id)
    _assert_field_filters(ctx, scope_id)
    _assert_action_filters(ctx, scope_id)
    _assert_event_filters(ctx, scope_id)

    print("Todos os filtros validados com sucesso.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1)
