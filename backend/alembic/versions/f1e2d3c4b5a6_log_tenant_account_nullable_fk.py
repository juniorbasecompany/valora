"""log.tenant_id e log.account_id nullable; FK ON DELETE SET NULL

Revision ID: f1e2d3c4b5a6
Revises: c7d9e1f3a2b4
Create Date: 2026-03-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = "c7d9e1f3a2b4"
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
    _drop_fk_on_column("log", "tenant_id")
    _drop_fk_on_column("log", "account_id")
    op.alter_column(
        "log",
        "tenant_id",
        existing_type=sa.BigInteger(),
        nullable=True,
        existing_nullable=False,
        comment="Licenciado ao qual o evento se refere. NULL após exclusão do licenciado.",
    )
    op.alter_column(
        "log",
        "account_id",
        existing_type=sa.BigInteger(),
        nullable=True,
        existing_nullable=False,
        comment="Conta do usuário que originou o evento. NULL após exclusão da conta.",
    )
    op.create_foreign_key(
        "log_tenant_id_fkey",
        "log",
        "tenant",
        ["tenant_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "log_account_id_fkey",
        "log",
        "account",
        ["account_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema.

    Falha se existir linha com tenant_id ou account_id NULL (restaura NOT NULL).
    """
    op.drop_constraint("log_tenant_id_fkey", "log", type_="foreignkey")
    op.drop_constraint("log_account_id_fkey", "log", type_="foreignkey")
    op.alter_column(
        "log",
        "tenant_id",
        existing_type=sa.BigInteger(),
        nullable=False,
        existing_nullable=True,
        comment="Ligação com o licenciado.",
    )
    op.alter_column(
        "log",
        "account_id",
        existing_type=sa.BigInteger(),
        nullable=False,
        existing_nullable=True,
        comment="Ligação com a conta do usuário que fez a modificação.",
    )
    op.create_foreign_key(
        "log_tenant_id_fkey",
        "log",
        "tenant",
        ["tenant_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
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
