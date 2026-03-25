# Serialização de entidades ORM para JSON de auditoria. Comentários em PT-BR.

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import inspect as sa_inspect


def audit_value(value: object) -> object:
    """Converte um valor de coluna para algo JSON-serializável."""
    if value is None:
        return None
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return value.hex()
    return str(value)


def entity_to_audit_dict(instance: object) -> dict[str, Any]:
    """
    Snapshot só das colunas mapeadas na tabela (sem relações expandidas).
    """
    mapper = sa_inspect(type(instance))
    row: dict[str, Any] = {}
    for column in mapper.columns:
        key = column.key
        row[key] = audit_value(getattr(instance, key))
    return row
