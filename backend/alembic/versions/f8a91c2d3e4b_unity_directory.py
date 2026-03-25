"""unity directory

Revision ID: f8a91c2d3e4b
Revises: c7e2a1b9048f
Create Date: 2026-03-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f8a91c2d3e4b"
down_revision: Union[str, Sequence[str], None] = "c7e2a1b9048f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "unity",
        sa.Column(
            "id",
            sa.BigInteger(),
            autoincrement=True,
            nullable=False,
            comment="Identificador da unidade produtiva.",
        ),
        sa.Column(
            "name",
            sa.Text(),
            nullable=False,
            comment="Nome curto da unidade produtiva.",
        ),
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=False,
            comment="Descrição da unidade produtiva.",
        ),
        sa.Column(
            "scope_id",
            sa.BigInteger(),
            nullable=False,
            comment="Escopo desta unidade produtiva.",
        ),
        sa.Column(
            "parent_unity_id",
            sa.BigInteger(),
            nullable=True,
            comment="Unidade produtiva pai na mesma hierarquia e escopo.",
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Ordem de exibição entre irmãos na hierarquia.",
        ),
        sa.CheckConstraint(
            "parent_unity_id IS NULL OR parent_unity_id <> id",
            name="unity_parent_self_chk",
        ),
        sa.ForeignKeyConstraint(
            ["scope_id"],
            ["scope.id"],
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scope_id", "parent_unity_id"],
            ["unity.scope_id", "unity.id"],
            name="unity_parent_same_scope_fk",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scope_id",
            "id",
            name="unity_scope_id_unique",
        ),
        comment=(
            "Unidade produtiva no escopo (ex.: galinha, fêmea, linhagem); "
            "permite hierarquia opcional."
        ),
    )
    op.create_index(
        "unity_scope_parent_sort_idx",
        "unity",
        ["scope_id", "parent_unity_id", "sort_order", "id"],
        unique=False,
    )
    op.create_index(
        "unity_scope_parent_name_idx",
        "unity",
        ["scope_id", "parent_unity_id", "name"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("unity_scope_parent_name_idx", table_name="unity")
    op.drop_index("unity_scope_parent_sort_idx", table_name="unity")
    op.drop_table("unity")
