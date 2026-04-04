"""
Teste ponta a ponta para validar read/write de input.value em eventos.

Uso:
  uv run python script_test_event_input_value.py
  uv run python script_test_event_input_value.py http://127.0.0.1:8003
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import requests
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from valora_backend.auth.jwt import create_access_token
from valora_backend.config import Settings
from valora_backend.model.identity import Member

FORMULA_INPUT_TOKEN_PATTERN = re.compile(r"\$\{input:(\d+)\}")


@dataclass
class TestContext:
    base_url: str
    token: str
    timeout: int = 30


def _print_ok(message: str) -> None:
    print(f"[OK] {message}")


def _print_skip(message: str) -> None:
    print(f"[SKIP] {message}")


def _request(
    ctx: TestContext,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = requests.request(
        method=method,
        url=f"{ctx.base_url}{path}",
        params=params,
        json=body,
        headers={"Authorization": f"Bearer {ctx.token}"},
        timeout=ctx.timeout,
    )
    if response.text:
        try:
            payload: dict[str, Any] | str = response.json()
        except requests.exceptions.JSONDecodeError:
            payload = response.text
    else:
        payload = {}
    if response.status_code != 200:
        raise AssertionError(
            f"{method} {path} status={response.status_code} params={params} body={body} payload={payload}"
        )
    if isinstance(payload, dict):
        return payload
    raise AssertionError(f"Resposta inválida em {method} {path}: {type(payload)}")


def _get_item_list(payload: dict[str, Any], path: str) -> list[dict[str, Any]]:
    item_list = payload.get("item_list")
    if not isinstance(item_list, list):
        raise AssertionError(f"{path} não retornou item_list válido")
    normalized: list[dict[str, Any]] = []
    for item in item_list:
        if isinstance(item, dict):
            normalized.append(item)
    return normalized


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


def _parse_input_field_id_list(formula_item_list: list[dict[str, Any]]) -> list[int]:
    field_id_list: list[int] = []
    field_id_set: set[int] = set()

    sorted_formula_list = sorted(
        formula_item_list,
        key=lambda item: (int(item.get("step") or 0), int(item.get("id") or 0)),
    )
    for formula in sorted_formula_list:
        statement = str(formula.get("statement") or "")
        for match in FORMULA_INPUT_TOKEN_PATTERN.finditer(statement):
            field_id = int(match.group(1))
            if field_id in field_id_set:
                continue
            field_id_set.add(field_id)
            field_id_list.append(field_id)
    return field_id_list


def _now_marker() -> str:
    return datetime.now(UTC).strftime("%Y%m%d%H%M%S")


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8003"
    ctx = _build_context(base_url)

    scope_payload = _request(ctx, "GET", "/auth/tenant/current/scopes")
    scope_item_list = _get_item_list(scope_payload, "/auth/tenant/current/scopes")
    if not scope_item_list:
        _print_skip("Sem escopo para validar evento/input")
        return 0
    scope_id = int(scope_payload.get("current_scope_id") or scope_item_list[0]["id"])

    event_payload = _request(ctx, "GET", f"/auth/tenant/current/scopes/{scope_id}/events")
    event_item_list = _get_item_list(event_payload, "/events")
    if not event_item_list:
        _print_skip("Sem evento para testar input.value")
        return 0
    event = event_item_list[0]
    event_id = int(event["id"])

    # Valida se PATCH de evento responde 200 (corrige regressão do 500).
    patch_payload = {
        "location_id": int(event["location_id"]),
        "item_id": int(event["item_id"]),
        "action_id": int(event["action_id"]),
        "moment_utc": event["moment_utc"],
    }
    _request(
        ctx,
        "PATCH",
        f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}",
        body=patch_payload,
    )
    _print_ok("PATCH de evento sem erro interno")

    action_id = int(event["action_id"])
    formula_payload = _request(
        ctx,
        "GET",
        f"/auth/tenant/current/scopes/{scope_id}/actions/{action_id}/formulas",
    )
    formula_item_list = _get_item_list(formula_payload, "/formulas")
    input_field_id_list = _parse_input_field_id_list(formula_item_list)
    if not input_field_id_list:
        _print_skip("Ação do evento não possui token de input nas fórmulas")
        return 0

    target_field_id = input_field_id_list[0]
    before_payload = _request(
        ctx,
        "GET",
        f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs",
    )
    before_input_item_list = _get_item_list(before_payload, "/inputs")
    before_input_by_field_id = {
        int(item["field_id"]): item for item in before_input_item_list if "field_id" in item
    }
    before_input = before_input_by_field_id.get(target_field_id)

    created_input_id: int | None = None
    original_value: str | None = None
    if before_input is not None:
        original_value = str(before_input.get("value") or "")
    test_value = f"script-input-{_now_marker()}"

    try:
        if before_input is None:
            create_payload = {
                "field_id": target_field_id,
                "value": test_value,
            }
            create_response = _request(
                ctx,
                "POST",
                f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs",
                body=create_payload,
            )
            create_item_list = _get_item_list(create_response, "/inputs")
            created = next(
                (
                    item
                    for item in create_item_list
                    if int(item.get("field_id") or 0) == target_field_id
                ),
                None,
            )
            if created is None:
                raise AssertionError("POST de input não retornou item criado")
            created_input_id = int(created["id"])
        else:
            input_id = int(before_input["id"])
            _request(
                ctx,
                "PATCH",
                f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs/{input_id}",
                body={"value": test_value},
            )

        after_payload = _request(
            ctx,
            "GET",
            f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs",
        )
        after_input_item_list = _get_item_list(after_payload, "/inputs")
        after_input = next(
            (
                item
                for item in after_input_item_list
                if int(item.get("field_id") or 0) == target_field_id
            ),
            None,
        )
        if after_input is None:
            raise AssertionError("GET de inputs não retornou campo testado")
        if str(after_input.get("value") or "") != test_value:
            raise AssertionError("Valor lido não corresponde ao input.value gravado")

        _print_ok("input.value grava e lê corretamente")
    finally:
        # Restaura o estado para o teste ser repetível.
        if created_input_id is not None:
            _request(
                ctx,
                "DELETE",
                f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs/{created_input_id}",
            )
        elif before_input is not None:
            _request(
                ctx,
                "PATCH",
                f"/auth/tenant/current/scopes/{scope_id}/events/{event_id}/inputs/{int(before_input['id'])}",
                body={"value": original_value or "0"},
            )

    print("Teste concluído com sucesso.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1)
