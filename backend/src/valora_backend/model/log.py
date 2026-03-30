# Modelo de auditoria: alteracoes em tabelas principais.

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from valora_backend.model.base import Base


BIGINT_COMPAT = BigInteger().with_variant(Integer, "sqlite")


class _SqliteLogRowPayload(TypeDecorator):
    """SQLite: None vira NULL SQL (JSON() gravava literal json null e quebrava o CHECK em D)."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return json.loads(value)


ROW_PAYLOAD_TYPE = _SqliteLogRowPayload().with_variant(JSONB(), "postgresql")


class Log(Base):
    """Registo de modificacao numa tabela monitorizada."""

    __tablename__ = "log"
    __table_args__ = (
        CheckConstraint(
            "table_name IN ("
            "'account', 'action', 'event', 'field', 'formula', 'input', 'label', 'location', 'member', 'result', 'scope', 'tenant', 'unity')",
            name="log_table_name_chk",
        ),
        CheckConstraint(
            "action_type IN ('I', 'U', 'D')",
            name="log_action_type_chk",
        ),
        CheckConstraint(
            "(action_type = 'D' AND \"row\" IS NULL) "
            "OR (action_type IN ('I', 'U') AND \"row\" IS NOT NULL)",
            name="log_row_payload_by_action_chk",
        ),
        {"comment": "Registra modificacoes feitas nas demais tabelas."},
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do log.",
    )
    account_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        nullable=True,
        comment=(
            "Identificador da conta que originou o evento, preservado no historico "
            "mesmo apos exclusao da conta."
        ),
    )
    tenant_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        nullable=True,
        comment=(
            "Identificador do licenciado relacionado ao evento, preservado no "
            "historico mesmo apos exclusao do licenciado."
        ),
    )
    table_name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome da tabela que foi modificada.",
    )
    action_type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Tipo da modificacao: I (insert), U (update), D (delete).",
    )
    row_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        nullable=False,
        comment="Identificador da linha na tabela referida por table_name.",
    )
    row_payload: Mapped[Any | None] = mapped_column(
        "row",
        ROW_PAYLOAD_TYPE,
        nullable=True,
        comment="Conteudo da linha. NULL em caso de delete.",
    )
    moment_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        comment="Momento em que ocorreu a acao.",
    )
