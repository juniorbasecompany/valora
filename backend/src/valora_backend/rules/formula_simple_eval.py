# Motor mínimo SimpleEval alinhado à skill rule-formula-simpleeval (lista branca).

from __future__ import annotations

import ast
import operator
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from dateutil.relativedelta import relativedelta
from simpleeval import SimpleEval


def _add_months(d: date | datetime, n: int | float) -> date | datetime:
    months = int(n)
    return d + relativedelta(months=months)


def _add_years(d: date | datetime, n: int | float) -> date | datetime:
    years = int(n)
    return d + relativedelta(years=years)


def _safe_truediv(a: Any, b: Any) -> Any:
    """Divisão real; divisor zero produz 0 (inclui decimal.DivisionByZero, subclasse de ZeroDivisionError)."""
    try:
        return operator.truediv(a, b)
    except ZeroDivisionError:
        return 0


def _safe_floordiv(a: Any, b: Any) -> Any:
    """Divisão inteira; divisor zero produz 0."""
    try:
        return operator.floordiv(a, b)
    except ZeroDivisionError:
        return 0


def _safe_mod(a: Any, b: Any) -> Any:
    """Resto; divisor zero produz 0."""
    try:
        return operator.mod(a, b)
    except ZeroDivisionError:
        return 0


def build_formula_simple_eval(names: dict[str, Any]) -> SimpleEval:
    """Constrói avaliador com `names` e funções permitidas (sem builtins livres)."""
    evaluator = SimpleEval()
    evaluator.operators[ast.Div] = _safe_truediv
    evaluator.operators[ast.FloorDiv] = _safe_floordiv
    evaluator.operators[ast.Mod] = _safe_mod
    evaluator.names = names
    evaluator.functions = {
        "date": date,
        "datetime": datetime,
        "timedelta": timedelta,
        "add_months": _add_months,
        "add_years": _add_years,
        "abs": abs,
        "min": min,
        "max": max,
        "round": round,
        "Decimal": Decimal,
    }
    return evaluator
