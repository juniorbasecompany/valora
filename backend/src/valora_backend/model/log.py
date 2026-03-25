# Modelo de auditoria: alterações em tabelas principais.

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, JSON, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from valora_backend.model.base import BIGINT, Base

# JSON em SQLite (testes); JSONB em PostgreSQL (produção), alinhado ao DDL.
_ROW_JSON_TYPE = JSON().with_variant(JSONB(astext_type=Text()), "postgresql")
# Default portável para create_all (testes em SQLite). Em BD já migrada, o DEFAULT do Postgres
# pode permanecer (now() AT TIME ZONE 'UTC') via Alembic; omissão da coluna no INSERT aplica o da BD.
_MOMENT_UTC_SERVER_DEFAULT = text("CURRENT_TIMESTAMP")


class Log(Base):
    """Registo de modificação numa tabela monitorizada."""

    __tablename__ = "log"
    __table_args__ = (
        CheckConstraint(
            "table_name IN ("
            "'tenant', 'account', 'member', 'scope', 'location', 'unity')",
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
        {"comment": "Registra modificações feitas nas demais tabelas."},
    )

    id: Mapped[int] = mapped_column(
        BIGINT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do log.",
    )
    account_id: Mapped[int] = mapped_column(
        BIGINT,
        ForeignKey("account.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment="Ligação com a conta do usuário que fez a modificação.",
    )
    tenant_id: Mapped[int] = mapped_column(
        BIGINT,
        ForeignKey("tenant.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment="Ligação com o licenciado.",
    )
    table_name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome da tabela que foi modificada.",
    )
    action_type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Tipo da modificação: I (insert), U (update), D (delete).",
    )
    row_payload: Mapped[Any | None] = mapped_column(
        "row",
        _ROW_JSON_TYPE,
        nullable=True,
        comment="Conteúdo da linha. NULL em caso de delete.",
    )
    moment_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=_MOMENT_UTC_SERVER_DEFAULT,
        comment="Momento em que ocorreu a ação.",
    )
