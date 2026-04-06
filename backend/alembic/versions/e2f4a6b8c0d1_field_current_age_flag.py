"""add current age flag to field

Revision ID: e2f4a6b8c0d1
Revises: d1e2f3a4b5c6
Create Date: 2026-04-06

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2f4a6b8c0d1"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "field",
        sa.Column(
            "is_current_age",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment=(
                "Indica que este campo contém a idade atual em dias, da unidade, "
                "do lote."
            ),
        ),
    )
    op.create_index(
        "field_scope_current_age_unique",
        "field",
        ["scope_id"],
        unique=True,
        postgresql_where=sa.text("is_current_age IS TRUE"),
        sqlite_where=sa.text("is_current_age = 1"),
    )
    op.alter_column("field", "is_current_age", server_default=None)


def downgrade() -> None:
    op.drop_index("field_scope_current_age_unique", table_name="field")
    op.drop_column("field", "is_current_age")
