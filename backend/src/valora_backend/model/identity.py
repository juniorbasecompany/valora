# Modelos estruturais iniciais: tenant, account, member, scope, location e item.

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from valora_backend.model.base import Base


BIGINT_COMPAT = BigInteger().with_variant(Integer, "sqlite")


class Tenant(Base):
    """Licenciado que contrata o sistema."""

    __tablename__ = "tenant"
    __table_args__ = {"comment": "Este é o licenciado que está contratando o sistema."}

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do licenciado.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome completo do licenciado.",
    )


class Scope(Base):
    """Escopo estrutural configurado dentro do licenciado."""

    __tablename__ = "scope"
    __table_args__ = {"comment": "Escopo do projeto: Aves, Soja, Leite..."}

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do escopo.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome do escopo: Aves, Soja, Leite...",
    )
    tenant_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("tenant.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação do escopo ao licenciado.",
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
        {"comment": "Esta é a conta do usuário do sistema."},
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador da conta do usuário.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome completo da conta do usuário.",
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
        Index(
            "member_unique_tenant_account",
            "tenant_id",
            "account_id",
            unique=True,
            postgresql_where=text("account_id IS NOT NULL"),
        ),
        {"comment": "Este é o usuário do sistema em um determinado licenciado."},
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do usuário.",
    )
    name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        info={"null_if_empty": True},
        comment="Nome completo do usuário.",
    )
    email: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Email do convite e identificação no primeiro acesso; editável no diretório, "
            "sem obrigatoriedade de coincidir com account.email após o vínculo."
        ),
    )
    tenant_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("tenant.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação do usuário ao licenciado.",
    )
    account_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("account.id", onupdate="CASCADE", ondelete="SET NULL"),
        nullable=True,
        comment="Ligação do usuário à conta do usuário.",
    )
    current_scope_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="SET NULL"),
        nullable=True,
        comment="Escopo atualmente selecionado pelo usuário dentro do licenciado.",
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
        comment=("Situação do usuário:\n" "1) Ativo\n" "2) Pendente\n" "3) Desativado"),
    )


class Location(Base):
    """Local hierárquico configurado dentro de um escopo."""

    __tablename__ = "location"
    __table_args__ = (
        CheckConstraint(
            "parent_location_id IS NULL OR parent_location_id <> id",
            name="location_parent_self_chk",
        ),
        UniqueConstraint(
            "scope_id",
            "id",
            name="location_scope_id_unique",
        ),
        ForeignKeyConstraint(
            ["scope_id", "parent_location_id"],
            ["location.scope_id", "location.id"],
            name="location_parent_same_scope_fk",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        Index(
            "location_scope_parent_sort_idx",
            "scope_id",
            "parent_location_id",
            "sort_order",
            "id",
        ),
        Index(
            "location_scope_parent_name_idx",
            "scope_id",
            "parent_location_id",
            "name",
        ),
        {
            "comment": (
                "Local onde ocorre a operação: fazenda, unidade, talhão, "
                "aviário, subdivisão..."
            )
        },
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do local.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Nome curto do local dentro da hierarquia: Fazenda Norte, "
            "Talhão 12, Aviário B..."
        ),
    )
    scope_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação do local ao escopo.",
    )
    parent_location_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        nullable=True,
        comment="Ligação do local ao local pai na mesma hierarquia e escopo.",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
        comment="Ordem técnica de exibição entre irmãos na hierarquia.",
    )


class Kind(Base):
    """Tipo de item (rótulo compartilhável) dentro de um escopo."""

    __tablename__ = "kind"
    __table_args__ = (
        UniqueConstraint("scope_id", "name", name="kind_scope_name_unique"),
        {
            "comment": (
                "Tipos de itens por escopo (ex.: galinha, cobb, fêmea); "
                "nome único por escopo."
            )
        },
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do tipo de item.",
    )
    scope_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Escopo ao qual pertence este tipo de item.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome do tipo de item.",
    )
    item_list: Mapped[list["Item"]] = relationship(back_populates="kind")


class Item(Base):
    """Item hierárquico configurado dentro de um escopo."""

    __tablename__ = "item"
    __table_args__ = (
        CheckConstraint(
            "parent_item_id IS NULL OR parent_item_id <> id",
            name="item_parent_self_chk",
        ),
        UniqueConstraint(
            "scope_id",
            "id",
            name="item_scope_id_unique",
        ),
        ForeignKeyConstraint(
            ["scope_id", "parent_item_id"],
            ["item.scope_id", "item.id"],
            name="item_parent_same_scope_fk",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        Index(
            "item_scope_parent_sort_idx",
            "scope_id",
            "parent_item_id",
            "sort_order",
            "id",
        ),
        Index(
            "item_scope_parent_kind_idx",
            "scope_id",
            "parent_item_id",
            "kind_id",
        ),
        {
            "comment": (
                "Item no escopo (ex.: galinha, fêmea, linhagem); "
                "permite hierarquia opcional."
            )
        },
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do item.",
    )
    scope_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Escopo deste item.",
    )
    kind_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("kind.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Tipo de item (rótulo compartilhado no escopo).",
    )
    kind: Mapped[Kind] = relationship(back_populates="item_list")
    parent_item_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        nullable=True,
        comment="Item pai na mesma hierarquia e escopo.",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
        comment="Ordem de exibição entre irmãos na hierarquia.",
    )


class Unity(Base):
    """Unidade alocada (lote) vinculada a um local."""

    __tablename__ = "unity"
    __table_args__ = ({"comment": "Unidade alocada (lote)."},)

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador da unidade.",
    )
    location_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("location.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Localização da unidade.",
    )
    item_id_list: Mapped[list[int]] = mapped_column(
        ARRAY(BIGINT_COMPAT).with_variant(JSON(), "sqlite"),
        nullable=False,
        comment="Lista de IDs de item (catálogo) no escopo.",
    )
    creation_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        comment="Momento de criação da unidade.",
    )
