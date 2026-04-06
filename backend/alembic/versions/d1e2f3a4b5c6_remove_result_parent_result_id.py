"""remove result parent_result_id

Revision ID: d1e2f3a4b5c6
Revises: c9d8e7f6a5b4
Create Date: 2026-04-06

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "result" DROP CONSTRAINT IF EXISTS result_parent_result_id_fkey'
    )
    op.drop_column("result", "parent_result_id")


def downgrade() -> None:
    op.add_column(
        "result",
        sa.Column(
            "parent_result_id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            nullable=True,
            comment=(
                "Ligação com o result anterior. Se o result pai for apagado ou modificado, "
                "todo os filhos devem ser apagados."
            ),
        ),
    )
    op.create_foreign_key(
        "result_parent_result_id_fkey",
        "result",
        "result",
        ["parent_result_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
