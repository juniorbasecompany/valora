from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class EventRow:
    event_id: int
    location_id: int
    item_id: int
    action_id: int
    action_sort_order: int
    moment_utc: datetime
    initial_age: int | None = None
    final_age: int | None = None
    current_age_result: int | None = None
    expected_output: int | None = None


def _parse_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def _event_sort_key(row: EventRow) -> tuple[date, int, datetime, int]:
    return (row.moment_utc.date(), row.action_sort_order, row.moment_utc, row.event_id)


def _load_events(path: Path) -> list[EventRow]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("O JSON precisa ser uma lista de eventos.")

    event_list: list[EventRow] = []
    for raw in payload:
        if not isinstance(raw, dict):
            raise ValueError("Cada evento do JSON precisa ser um objeto.")
        event_list.append(
            EventRow(
                event_id=int(raw["event_id"]),
                location_id=int(raw["location_id"]),
                item_id=int(raw["item_id"]),
                action_id=int(raw["action_id"]),
                action_sort_order=int(raw.get("action_sort_order", 0)),
                moment_utc=_parse_datetime(str(raw["moment_utc"])),
                initial_age=(
                    int(raw["initial_age"])
                    if raw.get("initial_age") is not None
                    else None
                ),
                final_age=(
                    int(raw["final_age"])
                    if raw.get("final_age") is not None
                    else None
                ),
                current_age_result=(
                    int(raw["current_age_result"])
                    if raw.get("current_age_result") is not None
                    else None
                ),
                expected_output=(
                    int(raw["expected_output"])
                    if raw.get("expected_output") is not None
                    else None
                ),
            )
        )
    return event_list


def _default_demo_events() -> list[EventRow]:
    return [
        EventRow(
            event_id=101,
            location_id=1,
            item_id=1,
            action_id=1,
            action_sort_order=0,
            moment_utc=_parse_datetime("2026-04-01T08:00:00Z"),
            initial_age=10,
            current_age_result=10,
            expected_output=10,
        ),
        EventRow(
            event_id=102,
            location_id=1,
            item_id=1,
            action_id=2,
            action_sort_order=1,
            moment_utc=_parse_datetime("2026-04-02T08:00:00Z"),
            current_age_result=11,
            expected_output=11,
        ),
        EventRow(
            event_id=103,
            location_id=1,
            item_id=1,
            action_id=2,
            action_sort_order=1,
            moment_utc=_parse_datetime("2026-04-03T08:00:00Z"),
            current_age_result=12,
            expected_output=12,
        ),
        EventRow(
            event_id=104,
            location_id=1,
            item_id=1,
            action_id=1,
            action_sort_order=0,
            moment_utc=_parse_datetime("2026-04-04T08:00:00Z"),
            final_age=12,
        ),
        EventRow(
            event_id=201,
            location_id=2,
            item_id=5,
            action_id=1,
            action_sort_order=0,
            moment_utc=_parse_datetime("2026-04-01T08:00:00Z"),
            initial_age=20,
        ),
        EventRow(
            event_id=202,
            location_id=2,
            item_id=5,
            action_id=2,
            action_sort_order=1,
            moment_utc=_parse_datetime("2026-04-02T08:00:00Z"),
            current_age_result=21,
        ),
    ]


def _print_header(title: str) -> None:
    print()
    print(title)
    print("=" * len(title))


def _describe_event(row: EventRow) -> str:
    return (
        f"evento={row.event_id} grupo=({row.location_id},{row.item_id}) "
        f"acao={row.action_id} ordem_acao={row.action_sort_order} "
        f"momento={row.moment_utc.isoformat()} "
        f"idade_inicial={row.initial_age} idade_final={row.final_age} "
        f"resultado_atual={row.current_age_result} esperado={row.expected_output}"
    )


def run_debug(
    *,
    event_list: list[EventRow],
    moment_from_utc: datetime,
    moment_to_utc: datetime,
) -> int:
    _print_header("ENTRADAS")
    print(f"periodo_inicial={moment_from_utc.isoformat()}Z")
    print(f"periodo_final={moment_to_utc.isoformat()}Z")
    print(f"quantidade_eventos_recebidos={len(event_list)}")

    filtered_event_list = [
        row for row in event_list if moment_from_utc <= row.moment_utc <= moment_to_utc
    ]
    filtered_event_list.sort(key=_event_sort_key)

    _print_header("PASSO 1 - EVENTOS DENTRO DO PERIODO")
    if not filtered_event_list:
        print("Nenhum evento encontrado no periodo informado.")
        print("SAIDA_ESPERADA: created=0 updated=0 unchanged=0 item_list=[]")
        return 0
    for row in filtered_event_list:
        print(_describe_event(row))

    grouped_event_map: dict[tuple[int, int], list[EventRow]] = {}
    for row in filtered_event_list:
        grouped_event_map.setdefault((row.location_id, row.item_id), []).append(row)

    eligible_event_id_set: set[int] = set()
    _print_header("PASSO 2 - JANELAS ELEGIVEIS")
    for group_key, group_event_list in grouped_event_map.items():
        print(f"grupo={group_key}")
        active_initial_event: EventRow | None = None
        for row in group_event_list:
            if row.initial_age is not None:
                active_initial_event = row
                print(
                    f"  encontrou_idade_inicial: evento={row.event_id} valor={row.initial_age}"
                )

            if active_initial_event is None:
                print(
                    f"  ignorado_evento={row.event_id}: ainda nao existe idade inicial aberta"
                )
                continue

            if row.final_age is None:
                print(
                    f"  evento={row.event_id}: janela ainda aberta, aguardando idade final"
                )
                continue

            print(
                "  fechou_janela:"
                f" inicial_evento={active_initial_event.event_id}"
                f" inicial_idade={active_initial_event.initial_age}"
                f" final_evento={row.event_id}"
                f" final_idade={row.final_age}"
            )
            collecting = False
            for candidate in group_event_list:
                if candidate.event_id == active_initial_event.event_id:
                    collecting = True
                if collecting:
                    eligible_event_id_set.add(candidate.event_id)
                    print(f"    evento_elegivel={candidate.event_id}")
                if candidate.event_id == row.event_id:
                    break
            active_initial_event = None

    _print_header("PASSO 3 - DIAGNOSTICO FINAL")
    if not eligible_event_id_set:
        print("Nenhuma janela elegivel foi formada.")
        print("Isso explica o comportamento da tela com 0 criados, 0 atualizados e 0 mantidos.")
        print("Motivo esperado: existe idade inicial sem idade final, ou idade final em outro grupo.")
        print("SAIDA_ESPERADA: created=0 updated=0 unchanged=0 item_list=[]")
        return 0

    eligible_event_list = [row for row in filtered_event_list if row.event_id in eligible_event_id_set]
    expected_output_count = 0
    mismatch_count = 0
    for row in eligible_event_list:
        if row.expected_output is None:
            print(
                f"evento={row.event_id}: elegivel, mas sem expected_output informado para validar."
            )
            continue
        expected_output_count += 1
        actual_value = row.current_age_result
        if actual_value == row.expected_output:
            print(
                f"evento={row.event_id}: resultado_atual={actual_value} "
                f"resultado_esperado={row.expected_output} OK"
            )
        else:
            mismatch_count += 1
            print(
                f"evento={row.event_id}: resultado_atual={actual_value} "
                f"resultado_esperado={row.expected_output} DIFERENTE"
            )

    print()
    print(f"eventos_elegiveis={len(eligible_event_list)}")
    print(f"eventos_com_saida_esperada={expected_output_count}")
    print(f"divergencias_encontradas={mismatch_count}")
    print("SAIDA_ESPERADA:")
    print("  - Se houver janela inicial->final no mesmo grupo, o backend deve produzir item_list nao vazio.")
    print("  - Se expected_output bater com current_age_result, o resultado calculado esta coerente.")
    print("  - Se divergencias_encontradas > 0, ha evidencia de problema na formula ou nos dados persistidos.")
    return 0 if mismatch_count == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Mostra o passo a passo da elegibilidade do calculo de idade atual, "
            "com parametros de entrada, parametros de saida e resultados esperados."
        )
    )
    parser.add_argument(
        "--input-json",
        type=Path,
        help="Arquivo JSON com a lista de eventos. Se omitido, usa um cenario demonstrativo.",
    )
    parser.add_argument(
        "--moment-from-utc",
        default="2026-04-01T00:00:00Z",
        help="Inicio do periodo em UTC.",
    )
    parser.add_argument(
        "--moment-to-utc",
        default="2026-04-30T23:59:59Z",
        help="Fim do periodo em UTC.",
    )
    args = parser.parse_args()

    event_list = _load_events(args.input_json) if args.input_json else _default_demo_events()
    return run_debug(
        event_list=event_list,
        moment_from_utc=_parse_datetime(args.moment_from_utc),
        moment_to_utc=_parse_datetime(args.moment_to_utc),
    )


if __name__ == "__main__":
    raise SystemExit(main())
