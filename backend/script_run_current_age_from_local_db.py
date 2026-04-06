from __future__ import annotations

import argparse
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from valora_backend.api.rules import (
    ScopeCurrentAgeCalculationRequest,
    calculate_scope_current_age,
)
from valora_backend.model.identity import Member
from valora_backend.model.rules import Action, Event, Field, Result
from valora_backend.config import Settings


def _parse_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC)
    return parsed.replace(tzinfo=UTC)


def _pick_member(session, member_id: int | None) -> Member:
    query = select(Member).where(
        Member.status == 1,
        Member.role.in_((1, 2)),
        Member.tenant_id.is_not(None),
    )
    if member_id is not None:
        query = query.where(Member.id == member_id)
    else:
        query = query.order_by(Member.id.asc()).limit(1)

    member = session.scalar(query)
    if member is None:
        raise RuntimeError("Nenhum member master/admin ativo foi encontrado no banco local.")
    return member


def _print_field_flags(session, scope_id: int) -> None:
    field_list = list(
        session.execute(
            select(Field.id, Field.is_initial_age, Field.is_current_age, Field.is_final_age)
            .where(Field.scope_id == scope_id)
            .order_by(Field.sort_order.asc(), Field.id.asc())
        )
    )
    print("campos_de_idade:")
    for field_id, is_initial_age, is_current_age, is_final_age in field_list:
        if not (is_initial_age or is_current_age or is_final_age):
            continue
        print(
            f"  field_id={field_id}"
            f" initial={bool(is_initial_age)}"
            f" current={bool(is_current_age)}"
            f" final={bool(is_final_age)}"
        )


def _resolve_age_field_ids(session, scope_id: int) -> tuple[int | None, int | None, int | None]:
    field_list = list(
        session.execute(
            select(Field.id, Field.is_initial_age, Field.is_current_age, Field.is_final_age)
            .where(Field.scope_id == scope_id)
            .order_by(Field.id.asc())
        )
    )
    initial_field_id = next((field_id for field_id, is_initial, _, _ in field_list if is_initial), None)
    current_field_id = next((field_id for field_id, _, is_current, _ in field_list if is_current), None)
    final_field_id = next((field_id for field_id, _, _, is_final in field_list if is_final), None)
    return initial_field_id, current_field_id, final_field_id


def _print_period_event_diagnostics(
    session,
    *,
    scope_id: int,
    moment_from_utc: datetime,
    moment_to_utc: datetime,
) -> None:
    initial_field_id, current_field_id, final_field_id = _resolve_age_field_ids(session, scope_id)
    event_row_list = list(
        session.execute(
            select(
                Event.id,
                Event.location_id,
                Event.item_id,
                Event.action_id,
                Event.moment_utc,
                Action.sort_order,
            )
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                Event.moment_utc >= moment_from_utc.replace(tzinfo=None),
                Event.moment_utc <= moment_to_utc.replace(tzinfo=None),
            )
            .order_by(
                func.date(Event.moment_utc).asc(),
                Action.sort_order.asc(),
                Event.moment_utc.asc(),
                Event.id.asc(),
            )
        )
    )

    result_value_by_event_and_field: dict[tuple[int, int], str] = {}
    if event_row_list:
        event_id_list = [int(row[0]) for row in event_row_list]
        result_row_list = list(
            session.execute(
                select(
                    Result.event_id,
                    Result.field_id,
                    Result.numeric_value,
                    Result.text_value,
                    Result.boolean_value,
                )
                .where(Result.event_id.in_(event_id_list))
                .order_by(Result.event_id.asc(), Result.id.asc())
            )
        )
        for event_id, field_id, numeric_value, text_value, boolean_value in result_row_list:
            if numeric_value is not None:
                value = str(numeric_value)
            elif text_value is not None:
                value = text_value
            else:
                value = str(boolean_value)
            result_value_by_event_and_field[(int(event_id), int(field_id))] = value

    print("eventos_do_periodo:")
    if not event_row_list:
        print("  nenhum")
        return

    for event_id, location_id, item_id, action_id, moment_utc, action_sort_order in event_row_list:
        initial_value = (
            result_value_by_event_and_field.get((int(event_id), initial_field_id))
            if initial_field_id is not None
            else None
        )
        current_value = (
            result_value_by_event_and_field.get((int(event_id), current_field_id))
            if current_field_id is not None
            else None
        )
        final_value = (
            result_value_by_event_and_field.get((int(event_id), final_field_id))
            if final_field_id is not None
            else None
        )
        print(
            f"  event_id={event_id}"
            f" location_id={location_id}"
            f" item_id={item_id}"
            f" action_id={action_id}"
            f" action_sort_order={action_sort_order}"
            f" moment_utc={moment_utc.isoformat()}"
            f" initial_result={initial_value}"
            f" current_result={current_value}"
            f" final_result={final_value}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Executa localmente o mesmo codigo de backend acionado pelo botao "
            "'Calcular', usando o banco local."
        )
    )
    parser.add_argument("--member-id", type=int, default=1)
    parser.add_argument("--scope-id", type=int)
    parser.add_argument("--moment-from-utc", default="2026-04-01T00:00:00Z")
    parser.add_argument("--moment-to-utc", default="2026-04-30T23:59:00Z")
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Mantem o commit real da execucao. Sem essa flag, faz rollback no fim.",
    )
    args = parser.parse_args()

    settings = Settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    moment_from_utc = _parse_datetime(args.moment_from_utc)
    moment_to_utc = _parse_datetime(args.moment_to_utc)

    with SessionLocal() as session:
        member = _pick_member(session, args.member_id)
        scope_id = args.scope_id or member.current_scope_id
        if scope_id is None:
            raise RuntimeError("O member selecionado nao possui current_scope_id.")

        print("ENTRADAS")
        print("========")
        print(f"database_url={settings.database_url}")
        print(f"member_id={member.id}")
        print(f"tenant_id={member.tenant_id}")
        print(f"role={member.role}")
        print(f"scope_id={scope_id}")
        print(f"moment_from_utc={moment_from_utc.isoformat()}")
        print(f"moment_to_utc={moment_to_utc.isoformat()}")
        print(f"persistir_resultado={bool(args.commit)}")

        event_count = session.scalar(
            select(func.count(Event.id))
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                Event.moment_utc >= moment_from_utc.replace(tzinfo=None),
                Event.moment_utc <= moment_to_utc.replace(tzinfo=None),
            )
        )
        result_count_before = session.scalar(
            select(func.count(Result.id))
            .join(Event, Result.event_id == Event.id)
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                Event.moment_utc >= moment_from_utc.replace(tzinfo=None),
                Event.moment_utc <= moment_to_utc.replace(tzinfo=None),
            )
        )

        print(f"eventos_no_periodo={event_count}")
        print(f"results_no_periodo_antes={result_count_before}")
        _print_field_flags(session, scope_id)
        _print_period_event_diagnostics(
            session,
            scope_id=scope_id,
            moment_from_utc=moment_from_utc,
            moment_to_utc=moment_to_utc,
        )

        print()
        print("EXECUCAO")
        print("========")
        print(
            "Chamando valora_backend.api.rules.calculate_scope_current_age "
            "(mesma funcao do endpoint POST /scopes/{scope_id}/events/calculate-current-age)"
        )

        try:
            response = calculate_scope_current_age(
                scope_id=scope_id,
                body=ScopeCurrentAgeCalculationRequest(
                    moment_from_utc=moment_from_utc.isoformat().replace("+00:00", "Z"),
                    moment_to_utc=moment_to_utc.isoformat().replace("+00:00", "Z"),
                ),
                member=member,
                session=session,
            )
        except HTTPException as exc:
            print("ERRO")
            print("====")
            print(f"status_code={exc.status_code}")
            print(f"detail={exc.detail}")
            session.rollback()
            return 1

        result_count_after = session.scalar(
            select(func.count(Result.id))
            .join(Event, Result.event_id == Event.id)
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                Event.moment_utc >= moment_from_utc.replace(tzinfo=None),
                Event.moment_utc <= moment_to_utc.replace(tzinfo=None),
            )
        )

        print()
        print("SAIDAS")
        print("======")
        print(f"created_count={response.created_count}")
        print(f"updated_count={response.updated_count}")
        print(f"unchanged_count={response.unchanged_count}")
        print(f"item_list_len={len(response.item_list)}")
        print(f"calculated_moment_utc={response.calculated_moment_utc.isoformat()}")
        print(f"results_no_periodo_depois={result_count_after}")

        if not response.item_list:
            print("item_list=[]")
        else:
            for item in response.item_list[:25]:
                print(
                    "item:"
                    f" event_id={item.event_id}"
                    f" result_id={item.result_id}"
                    f" field_id={item.field_id}"
                    f" formula_id={item.formula_id}"
                    f" formula_order={item.formula_order}"
                    f" numeric_value={item.numeric_value}"
                    f" text_value={item.text_value}"
                    f" boolean_value={item.boolean_value}"
                    f" status={item.status}"
                )
            if len(response.item_list) > 25:
                print(f"... {len(response.item_list) - 25} itens omitidos")

        if args.commit:
            print()
            print("COMMIT")
            print("======")
            print("A execucao foi mantida no banco local.")
        else:
            session.rollback()
            print()
            print("ROLLBACK")
            print("========")
            print("A execucao foi revertida no final. Rode com --commit para persistir.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
