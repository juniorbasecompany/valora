from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import inspect

from valora_backend.model import Base
from valora_backend.model.rules import Result

ERD_PATH = Path(__file__).resolve().parents[1] / "erd.json"


def test_erd_null_if_empty_matches_orm_metadata_for_mapped_table() -> None:
    erd_dict = json.loads(ERD_PATH.read_text(encoding="utf-8"))

    erd_null_if_empty_map: dict[str, set[str]] = {}
    for table_dict in erd_dict.get("tables", []):
        table_name = table_dict.get("name")
        if not isinstance(table_name, str) or not table_name:
            continue

        field_name_set = {
            field_dict["name"]
            for field_dict in table_dict.get("fields", [])
            if field_dict.get("nullIfEmpty") is True and isinstance(field_dict.get("name"), str)
        }
        if field_name_set:
            erd_null_if_empty_map[table_name] = field_name_set

    orm_null_if_empty_map: dict[str, set[str]] = {}
    for mapper in Base.registry.mappers:
        table_name = mapper.local_table.name
        field_name_set = {
            column.key
            for column in mapper.columns
            if column.info.get("null_if_empty") is True
        }
        orm_null_if_empty_map[table_name] = field_name_set

    modeled_table_set = set(orm_null_if_empty_map)
    comparable_erd_map = {
        table_name: field_name_set
        for table_name, field_name_set in erd_null_if_empty_map.items()
        if table_name in modeled_table_set
    }
    missing_model_table_set = set(erd_null_if_empty_map) - modeled_table_set

    assert comparable_erd_map == {
        table_name: orm_null_if_empty_map[table_name]
        for table_name in comparable_erd_map
    }
    assert missing_model_table_set == set()


def test_result_columns_match_erd() -> None:
    erd_dict = json.loads(ERD_PATH.read_text(encoding="utf-8"))
    result_table = next(
        table_dict
        for table_dict in erd_dict.get("tables", [])
        if table_dict.get("name") == "result"
    )

    assert [field_dict["name"] for field_dict in result_table["fields"]] == [
        column.key for column in inspect(Result).columns
    ]
