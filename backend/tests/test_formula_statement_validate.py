from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from valora_backend.rules.formula_statement_validate import (
    FormulaStatementValidationError,
    validate_formula_statement_for_scope,
)


def _session_with_scope_fields(field_spec_list: list[tuple[int, str]]) -> MagicMock:
    session = MagicMock()
    result = MagicMock()
    result.all.return_value = field_spec_list
    session.execute.return_value = result
    return session


def test_valid_assignment_multiply() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement=" ${field:1} = ${field:1} * ${field:2} ",
    )


def test_valid_division_two_numeric_fields_stub_zero() -> None:
    """Stubs numéricos são 0; divisão por zero no dry-run deve resultar em 0, não erro."""
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER"), (3, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:1} = ${field:2} / ${field:3}",
    )


def test_valid_floor_division_stub_zero() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER"), (3, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:1} = ${field:2} // ${field:3}",
    )


def test_valid_modulo_stub_zero() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER"), (3, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:1} = ${field:2} % ${field:3}",
    )


def test_valid_numeric_only_rhs() -> None:
    session = _session_with_scope_fields([(5, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:5} = 1 + 2 * 3",
    )


def test_valid_field_plus_float_literal() -> None:
    """Literais decimais na RHS devem validar (stub não pode ser Decimal só)."""
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:2} = ${field:1} + 0.20",
    )


def test_valid_input_reference_on_rhs() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:2} = ${input:1} + 1",
    )


def test_valid_mixed_field_and_input_on_rhs() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER"), (3, "INTEGER")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:3} = ${field:1} + ${input:2}",
    )


def test_valid_timedelta_on_date_field() -> None:
    # `timedelta(days=1)` não pode ser usado: o `=` de keyword quebra o parser de atribuição.
    # Um dia: timedelta(1); sete dias (uma semana): timedelta(7).
    session = _session_with_scope_fields([(1, "DATE"), (2, "DATE")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:2} = ${field:1} + timedelta(1)",
    )


def test_valid_add_months_on_timestamp_field() -> None:
    session = _session_with_scope_fields([(1, "TIMESTAMP")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:1} = add_months(${field:1}, 1)",
    )


def test_valid_boolean_expression_with_boolean_stub() -> None:
    session = _session_with_scope_fields([(1, "BOOLEAN"), (2, "BOOLEAN")])
    validate_formula_statement_for_scope(
        session,
        scope_id=10,
        statement="${field:1} = ${field:2} and True",
    )


def test_invalid_missing_equals() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="${field:1} * 2"
        )
    assert excinfo.value.code == "formula_invalid_assignment"


def test_invalid_multiple_assignment_in_same_statement() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${field:2}; ${field:2} = 10",
        )
    assert excinfo.value.code == "formula_invalid_assignment"


def test_invalid_lhs_not_only_token() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="x = ${field:1} + 1"
        )
    assert excinfo.value.code == "formula_invalid_target"


def test_invalid_lhs_with_input_token() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session, scope_id=10, statement="${input:1} = ${field:2} + 1"
        )
    assert excinfo.value.code == "formula_invalid_target"


def test_unknown_field_id() -> None:
    session = _session_with_scope_fields([(1, "INTEGER"), (2, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:99} = 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_rhs_reference_unknown_field() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${field:2} + 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_rhs_reference_unknown_input_id() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ${input:2} + 1",
        )
    assert excinfo.value.code == "formula_unknown_field_id"


def test_invalid_expression_syntax() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = ((((",
        )
    assert excinfo.value.code == "formula_expression_invalid"


def test_forbidden_function_not_in_whitelist() -> None:
    session = _session_with_scope_fields([(1, "INTEGER")])
    with pytest.raises(FormulaStatementValidationError) as excinfo:
        validate_formula_statement_for_scope(
            session,
            scope_id=10,
            statement="${field:1} = __import__('os')",
        )
    assert excinfo.value.code == "formula_expression_invalid"
