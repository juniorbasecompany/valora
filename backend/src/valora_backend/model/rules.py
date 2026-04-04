# Modelos de regras e eventos por escopo: field, action, formula, label, event, input, result.

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from valora_backend.model.base import Base

BIGINT_COMPAT = BigInteger().with_variant(Integer, "sqlite")


class Field(Base):
    """Definição de campo configurável (ex.: quantidade, mortes, valor)."""

    __tablename__ = "field"
    __table_args__ = {
        "comment": "Definição do campo. Ex: quantidade, mortes, valor",
    }

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador da definição do campo.",
    )
    scope_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment="Ligação com o escopo em que estamos trabalhando.",
    )
    type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Tipo do valor armazenado, considerando o padrão do dados do Postgres "
            "para tipo SQL completo como INTEGER, NUMERIC( 15, 2 ), BOOLEAN, etc."
        ),
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Ordem do campo em relação às demais no mesmo escopo.",
    )


class Action(Base):
    """Ação operacional configurável (ex.: Alojamento, Mortalidade)."""

    __tablename__ = "action"
    __table_args__ = {"comment": "Tabela para definir as ações. Ex: Alojamento, Mortalidade, etc..."}

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment=(
            "Identificador da ação. A ação pode ter uma ou mais fórmulas associadas."
        ),
    )
    scope_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("scope.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação com o escopo.",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Ordem da ação em relação às demais no mesmo escopo.",
    )


class Formula(Base):
    """Passo de fórmula associado a uma ação."""

    __tablename__ = "formula"
    __table_args__ = (
        UniqueConstraint("action_id", "step", name="formula_action_step_unique"),
        {
            "comment": "Fórmula que deve ser aplicada aos eventos da ação.",
        },
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador da fórmula.",
    )
    action_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("action.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment="Identificação da ação.",
    )
    step: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Ordem que as fórmulas devem ser executadas. UNIQUE por action_id + step.",
    )
    statement: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Instrução matemática. Ex: ${field:1} = ${field:1} * ${field:2}, que para o "
            "usuário, será mostrado como: Mortalidade = Quantidade * Fator"
        ),
    )


class Label(Base):
    """Rótulo i18n para campo ou ação."""

    __tablename__ = "label"
    __table_args__ = (
        CheckConstraint(
            "lang IN ('pt-BR', 'en', 'es')",
            name="label_lang_chk",
        ),
        CheckConstraint(
            "(field_id IS NOT NULL AND action_id IS NULL) "
            "OR (field_id IS NULL AND action_id IS NOT NULL)",
            name="label_field_xor_action_chk",
        ),
        Index(
            "label_unique_lang_field",
            "lang",
            "field_id",
            unique=True,
            sqlite_where=text("field_id IS NOT NULL"),
            postgresql_where=text("field_id IS NOT NULL"),
        ),
        Index(
            "label_unique_lang_action",
            "lang",
            "action_id",
            unique=True,
            sqlite_where=text("action_id IS NOT NULL"),
            postgresql_where=text("action_id IS NOT NULL"),
        ),
        {
            "comment": (
                "Serve basicamente para dar um nome amigável para o campo ou para a ação. "
                "Exatamente um entre field_id e action_id deve estar preenchido.\n"
                "unique por (lang, field_id) e por (lang, action_id)"
            ),
        },
    )

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do registro de valor.",
    )
    lang: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Identificação da linguagem.",
    )
    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome amigável do campo ou da ação.",
    )
    field_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("field.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=True,
        comment=(
            "LIgação com o campo. Nem sempre está informado, pois pode estar ligado à ação."
        ),
    )
    action_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("action.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=True,
        comment=(
            "LIgação com a ação. Nem sempre está informado, pois pode estar ligado ao campo."
        ),
    )


class Event(Base):
    """Evento em que uma ação se aplica a local e item."""

    __tablename__ = "event"
    __table_args__ = {
        "comment": "É o momento em que determinada fórmula é aplicada.",
    }

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do evento.",
    )
    location_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("location.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação ao local.",
    )
    item_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("item.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação ao item.",
    )
    moment_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        comment="Momento do evento ou da medição.",
    )
    action_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("action.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação à ação.",
    )


class Input(Base):
    """Valor de entrada de parâmetro num evento."""

    __tablename__ = "input"
    __table_args__ = {
        "comment": (
            "Aqui ficam registrados os valores dos parâmetros de entrada das ações "
            "aplicadas aos eventos em cada dia."
        ),
    }

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do parâmetro de entrada da ação.",
    )
    event_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("event.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        comment=(
            "Ligação com o evento onde o parâmetro de entrada deverá ser solicitado ao usuário."
        ),
    )
    field_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("field.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação com a definição do campo. Este é o campo de entrada da ação.",
    )
    value: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Este é o valor do parâmetro, representado em um formato que pode ser convertido "
            "de 'text' para o formato nativo do postgres, indicado no campo field.type. "
            'Ex: "123" poderá ser convertido para o numérico 123.00 se o field.type for '
            '"NUMERIC( 10, 2 )"'
        ),
    )


class Result(Base):
    """Resultado de fórmula aplicado a um evento."""

    __tablename__ = "result"
    __table_args__ = {
        "comment": (
            "Aqui ficam registrados os resultados das fórmulas aplicadas aos eventos em cada dia."
        ),
    }

    id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        primary_key=True,
        autoincrement=True,
        comment="Identificador do resultado da fórmula aplicada ao evento.",
    )
    event_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("event.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment="Ligação com o evento onde o resultado da fórmula foi aplicado.",
    )
    value: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Este é o valor resultado da aplicação da fórmula em determinado evento. "
            "É gravado no formato 'text'. Este valor, submetido field.type, volta ao tipo "
            'nativo do postgres. Ex: "123" será convertido para inteiro se field.type for "INTEGER"'
        ),
    )
    parent_result_id: Mapped[int | None] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("result.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=True,
        comment=(
            "Ligação com o result anterior. Se o result pai for apagado ou modificado, "
            "todo os filhos devem ser apagados."
        ),
    )
    moment_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        comment="Este é o momento em que o cálculo foi efetuado.",
    )
    field_id: Mapped[int] = mapped_column(
        BIGINT_COMPAT,
        ForeignKey("field.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        comment=(
            "Ligação com a definição do campo. Este campo é o resultado da aplicação da "
            "fórmula em determinado evento."
        ),
    )

