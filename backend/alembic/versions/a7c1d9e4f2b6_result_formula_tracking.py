"""result: add formula_id and formula_order

Revision ID: a7c1d9e4f2b6
Revises: f5c3d7e9a1b2
Create Date: 2026-04-06

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c1d9e4f2b6"
down_revision: Union[str, Sequence[str], None] = "f5c3d7e9a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "result",
        sa.Column(
            "formula_id",
            sa.BigInteger(),
            nullable=False,
            comment="Ligação com a formula.",
        ),
    )
    op.add_column(
        "result",
        sa.Column(
            "formula_order",
            sa.Integer(),
            nullable=False,
            comment="Ordem do cálculo das fórmulas do mesmo evento.",
        ),
    )
    op.create_foreign_key(
        "result_formula_id_fkey",
        "result",
        "formula",
        ["formula_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("result_formula_id_fkey", "result", type_="foreignkey")
    op.drop_column("result", "formula_order")
    op.drop_column("result", "formula_id")
