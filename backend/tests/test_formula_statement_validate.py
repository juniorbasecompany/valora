from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from valora_backend.rules.formula_statement_validate import (
    FormulaStatementValidationError,
    validate_formula_statement_for_scope,
)


def _session_with_field_ids(field_ids: list[int]) -> MagicMock:
    session = MagicMock()
    chain = MagicMock()
    chain.all.return_value = field_ids
    session.scalars.return_value = chain
    return session


def test_valid_assignment_multiply() -> None:
    session = _session_with_field_ids([1, 2])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement=" ${field:1} = ${field:1} * ${field:2} ",
    )


def test_valid_numeric_only_rhs() -> None:
    session = _session_with_field_ids([5])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:5} = 1 + 2 * 3",
    )


def test_valid_field_plus_float_literal() -> None:
    """Literais decimais na RHS devem validar (stub não pode ser Decimal só)."""
    session = _session_with_field_ids([1, 2])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:2} = ${field:1} + 0.20",
    )


def test_valid_input_reference_on_rhs() -> None:
    session = _session_with_field_ids([1, 2])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:2} = ${input:1} + 1",
    )


def test_valid_mixed_field_and_input_on_rhs() -> None:
    session = _session_with_field_ids([1, 2, 3])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:3} = ${field:1} + ${input:2}",
    )


def test_invalid_missing_equals() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="${field:1} * 2"
        )
    assert excinfo.value.code == "formula_invalid_assignment"


def test_invalid_multiple_assignment_in_same_statement() -> None:
    session = _session_with_field_ids([1, 2])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${field:2}; ${field:2} = 10",
        )
    assert excinfo.value.code == "formula_invalid_assignment"


def test_invalid_lhs_not_only_token() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="x = ${field:1} + 1"
        )
    assert excinfo.value.code == "formula_invalid_target"


def test_invalid_lhs_with_input_token() -> None:
    session = _session_with_field_ids([1, 2])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="${input:1} = ${field:2} + 1"
        )
    assert excinfo.value.code == "formula_invalid_target"


def test_unknown_field_id() -> None:
    session = _session_with_field_ids([1, 2])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:99} = 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_rhs_reference_unknown_field() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${field:2} + 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_rhs_reference_unknown_input_id() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${input:2} + 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_invalid_expression_syntax() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ((((",
        )
    assert excinfo.value.code == "formula_expression_invalid"


def test_forbidden_function_not_in_whitelist() -> None:
    session = _session_with_field_ids([1])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = __import__('os')",
        )
    assert excinfo.value.code == "formula_expression_invalid"
