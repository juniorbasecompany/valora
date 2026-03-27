"""member: permite name e display_name nulos em qualquer status

Revision ID: f3a0b1c2d3e4
Revises: d4c8b2a0e1f3
Create Date: 2026-03-27

"""

from typing import Sequence, Union

from alembic import op


revision: str = "f3a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "d4c8b2a0e1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("member_name_empty", "member", type_="check")
    op.drop_constraint("member_display_name_empty", "member", type_="check")


def downgrade() -> None:
    op.create_check_constraint(
        "member_name_empty",
        "member",
        "status = 2 OR name IS NOT NULL",
    )
    op.create_check_constraint(
        "member_display_name_empty",
        "member",
        "status = 2 OR display_name IS NOT NULL",
    )
