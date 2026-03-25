"""log: member_id -> account_id

Revision ID: e4a2c8f0d1b3
Revises: 0b4e8f1a2c9d
Create Date: 2026-03-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a2c8f0d1b3"
down_revision: Union[str, Sequence[str], None] = "0b4e8f1a2c9d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_fk_on_column(table: str, column: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for fk in inspector.get_foreign_keys(table):
        if fk["constrained_columns"] == [column]:
            op.drop_constraint(fk["name"], table, type_="foreignkey")
            return


def upgrade() -> None:
    """Upgrade schema."""
    _drop_fk_on_column("log", "member_id")
    op.drop_column("log", "member_id")
    op.add_column(
        "log",
        sa.Column(
            "account_id",
            sa.BigInteger(),
            nullable=False,
            comment="Ligação com a conta do usuário que fez a modificação.",
        ),
    )
    op.create_foreign_key(
        "log_account_id_fkey",
        "log",
        "account",
        ["account_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("log_account_id_fkey", "log", type_="foreignkey")
    op.drop_column("log", "account_id")
    op.add_column(
        "log",
        sa.Column(
            "member_id",
            sa.BigInteger(),
            nullable=False,
            comment="Ligação com a pessoa que fez a modificação.",
        ),
    )
    op.create_foreign_key(
        "log_member_id_fkey",
        "log",
        "member",
        ["member_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
