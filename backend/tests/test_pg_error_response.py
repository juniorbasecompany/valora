from __future__ import annotations

import json

from sqlalchemy.exc import IntegrityError

from valora_backend.pg_error_response import (
    build_unhandled_db_error_detail,
    extract_pg_error_context,
    match_pg_registry_rule,
    try_build_pg_registry_error_response,
)


def _make_fake_pg_orig(
    *,
    pg_code: str = "23503",
    constraint_name: str | None = "result_formula_id_fkey",
    message_primary: str = "update or delete on table \"formula\" violates foreign key",
) -> Exception:
    diag = type(
        "FakeDiag",
        (),
        {
            "message_primary": message_primary,
            "constraint_name": constraint_name,
            "schema_name": None,
            "table_name": "result",
        },
    )()
    orig = Exception("driver")
    orig.pgcode = pg_code  # type: ignore[attr-defined]
    orig.diag = diag  # type: ignore[attr-defined]
    return orig


def test_extract_pg_error_context_from_integrity_error() -> None:
    orig = _make_fake_pg_orig()
    exc = IntegrityError("DELETE FROM formula ...", {}, orig)
    ctx = extract_pg_error_context(exc)
    assert ctx is not None
    assert ctx.pg_code == "23503"
    assert ctx.constraint_name == "result_formula_id_fkey"


def test_match_registry_result_formula_fkey() -> None:
    ctx = extract_pg_error_context(
        IntegrityError("stmt", {}, _make_fake_pg_orig())
    )
    assert ctx is not None
    rule = match_pg_registry_rule(ctx)
    assert rule is not None
    assert rule.api_code == "error.db.foreign_key_result_references_formula"
    assert rule.status_code == 409


def test_match_registry_generic_fk() -> None:
    orig = _make_fake_pg_orig(constraint_name="other_fkey")
    ctx = extract_pg_error_context(IntegrityError("stmt", {}, orig))
    assert ctx is not None
    rule = match_pg_registry_rule(ctx)
    assert rule is not None
    assert rule.api_code == "error.db.foreign_key_violation"


def test_try_build_pg_registry_response_json() -> None:
    response = try_build_pg_registry_error_response(
        IntegrityError("stmt", {}, _make_fake_pg_orig())
    )
    assert response is not None
    assert response.status_code == 409
    body = json.loads(response.body)
    assert body["detail"]["code"] == "error.db.foreign_key_result_references_formula"
    assert body["detail"]["pg_code"] == "23503"
    assert body["detail"]["constraint"] == "result_formula_id_fkey"


def test_unhandled_detail_contains_message() -> None:
    orig = Exception("plain driver error")
    orig.pgcode = "XX000"  # type: ignore[attr-defined]
    diag = type("D", (), {"message_primary": "Something obscure happened."})()
    orig.diag = diag  # type: ignore[attr-defined]
    exc = IntegrityError("stmt", {}, orig)
    detail = build_unhandled_db_error_detail(exc)
    assert detail["code"] == "error.db.unhandled"
    assert "obscure" in detail["message"]
    assert detail["pg_code"] == "XX000"
