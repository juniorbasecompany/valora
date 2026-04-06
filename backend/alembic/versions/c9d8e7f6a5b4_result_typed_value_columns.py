"""align result table with typed value columns from erd

Revision ID: c9d8e7f6a5b4
Revises: b8c9d0e1f2a3
Create Date: 2026-04-06

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "result",
        sa.Column(
            "text_value",
            sa.Text(),
            nullable=True,
            comment="Este é resultado da fórmula, no formato texto.",
        ),
    )
    op.add_column(
        "result",
        sa.Column(
            "boolean_value",
            sa.Boolean(),
            nullable=True,
            comment="Este é resultado da fórmula, no formato booleano.",
        ),
    )
    op.add_column(
        "result",
        sa.Column(
            "numeric_value",
            sa.Numeric(15, 10),
            nullable=True,
            comment="Este é resultado da fórmula, no formato numérico.",
        ),
    )

    op.execute('UPDATE "result" SET text_value = value WHERE value IS NOT NULL')
    op.drop_column("result", "value")


def downgrade() -> None:
    op.add_column(
        "result",
        sa.Column(
            "value",
            sa.Text(),
            nullable=True,
            comment=(
                "Este é o valor resultado da aplicação da fórmula em determinado evento. "
                "É gravado no formato 'text'. Este valor, submetido field.type, volta ao tipo "
                'nativo do postgres. Ex: "123" será convertido para inteiro se field.type for "INTEGER"'
            ),
        ),
    )

    op.execute(
        """
        UPDATE "result"
        SET value = COALESCE(
            text_value,
            CASE
                WHEN boolean_value IS NULL THEN NULL
                WHEN boolean_value THEN 'true'
                ELSE 'false'
            END,
            CAST(numeric_value AS TEXT),
            ''
        )
        """
    )

    op.alter_column("result", "value", nullable=False)
    op.drop_column("result", "numeric_value")
    op.drop_column("result", "boolean_value")
    op.drop_column("result", "text_value")
