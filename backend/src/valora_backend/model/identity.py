# Modelos de identidade: tenant, account, member (fase 1 do ERD).

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from valora_backend.model.base import Base


class Tenant(Base):
    """Licenciado que contrata o sistema."""

    __tablename__ = "tenant"
    __table_args__ = {"comment": "Este é o licenciado que está contratando o sistema."}

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do licenciado.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome completo do licenciado.",
    )
    display_name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome do licenciado.",
    )


class Account(Base):
    """Conta de utilizador do sistema (provedor de autenticação)."""

    __tablename__ = "account"
    __table_args__ = (
        UniqueConstraint("email", name="account_unique_email"),
        UniqueConstraint(
            "provider",
            "provider_subject",
            name="account_unique_provider_subject",
        ),
        {"comment": "Esté a conta do usuário do sistema."},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="Identificador da conta do usuário.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome completo da conta do usuário.",
    )
    display_name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome do usuário da conta.",
    )
    email: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Email da conta do usuário, ligado ao provedor de autenticação.",
    )
    provider: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Indica qual foi o mecanismo de autenticação utilizado pela conta do "
            "usuário (ex.: google auth)."
        ),
    )
    provider_subject: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Identificador estável da conta no provedor de autenticação.",
    )


class Member(Base):
    """Utilizador do sistema num dado licenciado."""

    __tablename__ = "member"
    __table_args__ = (
        CheckConstraint(
            "status IN (1, 2, 3)",
            name="member_status_chk",
        ),
        CheckConstraint(
            "status = 2 OR name IS NOT NULL",
            name="member_name_empty",
        ),
        CheckConstraint(
            "status = 2 OR display_name IS NOT NULL",
            name="member_display_name_empty",
        ),
        Index(
            "member_unique_tenant_account",
            "tenant_id",
            "account_id",
            unique=True,
            postgresql_where=text("account_id IS NOT NULL"),
        ),
        {"comment": "Esté o usuário do sistema em um determinado licenciado."},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do usuário.",
    )
    name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Nome completo do usuário.",
    )
    display_name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Nome do usuário.",
    )
    email: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Email do usuário.",
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tenant.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação do usuário ao licenciado.",
    )
    account_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("account.id", onupdate="CASCADE", ondelete="SET NULL"),
        nullable=True,
        comment="Ligação do usuário à conta do usuário.",
    )
    role: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("role IN (1, 2, 3)"),
        nullable=False,
        default=3,
        server_default=text("3"),
        comment="Papel do usuário no licenciado: 1 master, 2 admin, 3 member.",
    )
    status: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment=(
            "Situação do usuário:\n"
            "1) Ativo\n"
            "2) Pendente\n"
            "3) Desativado"
        ),
    )
