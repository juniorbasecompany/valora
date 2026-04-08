"""Colunas unity.name e event.unity_id no modelo ORM."""

from __future__ import annotations

from sqlalchemy import inspect

from valora_backend.model.identity import Unity
from valora_backend.model.rules import Event


def test_unity_model_exposes_name_column() -> None:
    column_key_set = {column.key for column in inspect(Unity).columns}
    assert "name" in column_key_set


def test_event_model_exposes_unity_id_column() -> None:
    column_key_set = {column.key for column in inspect(Event).columns}
    assert "unity_id" in column_key_set
