# Modelo de auditoria: alterações em tabelas principais.

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from valora_backend.model.base import Base


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
        {"comment": "Registra modificações feitas nas demais tabelas."},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do log.",
    )
    account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("account.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment="Ligação com a conta do usuário que fez a modificação.",
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger,
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
    row_payload: Mapped[Any] = mapped_column(
        "row",
        JSONB,
        nullable=False,
        comment="Conteúdo da linha; JSON vazio em caso de delete.",
    )
    moment_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=text("(now() AT TIME ZONE 'UTC')"),
        comment="Momento em que ocorreu a ação.",
    )
