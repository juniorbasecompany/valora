# Garante que handlers de lista em rules nao usam Query() como default Python,
# para chamadas diretas (ex.: return list_scope_* apos POST) nao passarem Query ao SQLAlchemy.

from __future__ import annotations

import inspect

import pytest
from fastapi.params import Param

from valora_backend.api.rules import (
    list_scope_actions,
    list_scope_events,
    list_scope_fields,
    list_scope_labels,
)


@pytest.mark.parametrize(
    "handler",
    [
        list_scope_fields,
        list_scope_actions,
        list_scope_labels,
        list_scope_events,
    ],
)
def test_list_handlers_do_not_use_query_object_as_python_default(handler) -> None:
    """Defaults de parametros de query devem ser None ou str, nao instancia de Query()."""
    for name, param in inspect.signature(handler).parameters.items():
        if param.default is inspect.Parameter.empty:
            continue
        if type(param.default).__name__ == "Depends":
            continue
        assert not isinstance(
            param.default, Param
        ), (
            f"{handler.__name__}.{name}: use Annotated[..., Query()] = None "
            f"(ou literal), nao `= Query(...)` como default Python."
        )
