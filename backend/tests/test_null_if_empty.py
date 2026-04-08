from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import inspect

from valora_backend.model.identity import Member
from valora_backend.model.null_if_empty import (
    NULL_IF_EMPTY_EXAMPLE_MAP,
    commit_session_with_null_if_empty,
    normalize_model_null_if_empty,
    normalize_session_null_if_empty,
    value_is_empty_for_type,
)


@dataclass
class SessionSpy:
    new: list[object] = field(default_factory=list)
    dirty: list[object] = field(default_factory=list)
    commit_call_count: int = 0

    def commit(self) -> None:
        self.commit_call_count += 1


def test_member_column_info_marks_null_if_empty_fields() -> None:
    member_mapper = inspect(Member)
    column_map = {column.key: column for column in member_mapper.columns}

    assert column_map["name"].info["null_if_empty"] is True
    assert column_map["account_id"].info.get("null_if_empty") is None
    assert column_map["email"].info.get("null_if_empty") is None


def test_normalize_model_null_if_empty_reads_metadata_from_orm() -> None:
    member = Member(
        name="",
        email="maria@example.com",
        tenant_id=1,
        account_id=0,
        role=3,
        status=2,
    )

    changed = normalize_model_null_if_empty(member)

    assert changed is True
    assert member.name is None
    assert member.account_id == 0


def test_normalize_session_null_if_empty_converts_member_empty_value() -> None:
    member = Member(
        name="",
        email="maria@example.com",
        tenant_id=1,
        account_id=0,
        role=3,
        status=2,
    )
    session = SessionSpy(new=[member])

    normalize_session_null_if_empty(session)

    assert member.name is None
    assert member.account_id == 0


def test_commit_session_with_null_if_empty_normalizes_before_commit() -> None:
    member = Member(
        name="",
        email="maria@example.com",
        tenant_id=1,
        account_id=0,
        role=3,
        status=2,
    )
    session = SessionSpy(new=[member])

    commit_session_with_null_if_empty(session)

    assert member.name is None
    assert member.account_id == 0
    assert session.commit_call_count == 1


def test_value_is_empty_for_type_covers_first_round_examples() -> None:
    assert NULL_IF_EMPTY_EXAMPLE_MAP["TEXT"] == ""
    assert NULL_IF_EMPTY_EXAMPLE_MAP["BIGINT"] == 0
    assert NULL_IF_EMPTY_EXAMPLE_MAP["DATE"] == ""
    assert NULL_IF_EMPTY_EXAMPLE_MAP["TIMESTAMPTZ"] == ""
    assert NULL_IF_EMPTY_EXAMPLE_MAP["JSONB"] == {}

    assert value_is_empty_for_type("TEXT", "")
    assert value_is_empty_for_type("BIGINT", 0)
    assert value_is_empty_for_type("DATE", "")
    assert value_is_empty_for_type("TIMESTAMPTZ", "")
    assert value_is_empty_for_type("JSONB", {})
    assert not value_is_empty_for_type("BOOLEAN", False)
