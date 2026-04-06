"""move age markers from unity to field

Revision ID: b8c9d0e1f2a3
Revises: a1b2c3d4e5f8
Create Date: 2026-04-06

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "field",
        sa.Column(
            "is_initial_age",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment=(
                "Indica que este campo contém a idade inicial em dias, da unidade, "
                "do lote. O motor começa o cálculo no dia do evento que registrar este campo."
            ),
        ),
    )
    op.add_column(
        "field",
        sa.Column(
            "is_final_age",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment=(
                "Indica que este campo contém a idade final em dias, da unidade, "
                "do lote. O motor pára de calcular no dia do evento que registrar este campo."
            ),
        ),
    )
    op.create_check_constraint(
        "field_age_flags_not_both_chk",
        "field",
        "NOT (is_initial_age AND is_final_age)",
    )
    op.create_index(
        "field_scope_initial_age_unique",
        "field",
        ["scope_id"],
        unique=True,
        postgresql_where=sa.text("is_initial_age IS TRUE"),
        sqlite_where=sa.text("is_initial_age = 1"),
    )
    op.create_index(
        "field_scope_final_age_unique",
        "field",
        ["scope_id"],
        unique=True,
        postgresql_where=sa.text("is_final_age IS TRUE"),
        sqlite_where=sa.text("is_final_age = 1"),
    )
    op.alter_column("field", "is_initial_age", server_default=None)
    op.alter_column("field", "is_final_age", server_default=None)

    op.drop_constraint("unity_age_range_chk", "unity", type_="check")
    op.drop_column("unity", "initial_age")
    op.drop_column("unity", "final_age")


def downgrade() -> None:
    op.add_column(
        "unity",
        sa.Column(
            "final_age",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Idade final.",
        ),
    )
    op.add_column(
        "unity",
        sa.Column(
            "initial_age",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Idade inicial.",
        ),
    )
    op.create_check_constraint(
        "unity_age_range_chk",
        "unity",
        "initial_age <= final_age",
    )
    op.alter_column("unity", "initial_age", server_default=None)
    op.alter_column("unity", "final_age", server_default=None)

    op.drop_index("field_scope_final_age_unique", table_name="field")
    op.drop_index("field_scope_initial_age_unique", table_name="field")
    op.drop_constraint("field_age_flags_not_both_chk", "field", type_="check")
    op.drop_column("field", "is_final_age")
    op.drop_column("field", "is_initial_age")
