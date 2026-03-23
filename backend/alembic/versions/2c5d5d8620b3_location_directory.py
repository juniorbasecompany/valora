"""location directory

Revision ID: 2c5d5d8620b3
Revises: 8a44c22a9c7e
Create Date: 2026-03-22 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2c5d5d8620b3"
down_revision: Union[str, Sequence[str], None] = "8a44c22a9c7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "location",
        sa.Column(
            "id",
            sa.BigInteger(),
            autoincrement=True,
            nullable=False,
            comment="Identificador do local.",
        ),
        sa.Column(
            "name",
            sa.Text(),
            nullable=False,
            comment=(
                "Nome curto do local dentro da hierarquia: Fazenda Norte, "
                "Talhão 12, Aviário B..."
            ),
        ),
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=False,
            comment="Descrição do local com mais contexto para a operação.",
        ),
        sa.Column(
            "scope_id",
            sa.BigInteger(),
            nullable=False,
            comment="Ligação do local ao escopo.",
        ),
        sa.Column(
            "parent_location_id",
            sa.BigInteger(),
            nullable=True,
            comment="Ligação do local ao local pai na mesma hierarquia e escopo.",
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Ordem técnica de exibição entre irmãos na hierarquia.",
        ),
        sa.CheckConstraint(
            "parent_location_id IS NULL OR parent_location_id <> id",
            name="location_parent_self_chk",
        ),
        sa.ForeignKeyConstraint(
            ["scope_id"],
            ["scope.id"],
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scope_id", "parent_location_id"],
            ["location.scope_id", "location.id"],
            name="location_parent_same_scope_fk",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scope_id",
            "id",
            name="location_scope_id_unique",
        ),
        comment=(
            "Local onde ocorre a operação: fazenda, unidade, talhão, "
            "aviário, subdivisão..."
        ),
    )
    op.create_index(
        "location_scope_parent_sort_idx",
        "location",
        ["scope_id", "parent_location_id", "sort_order", "id"],
        unique=False,
    )
    op.create_index(
        "location_scope_parent_name_idx",
        "location",
        ["scope_id", "parent_location_id", "name"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("location_scope_parent_name_idx", table_name="location")
    op.drop_index("location_scope_parent_sort_idx", table_name="location")
    op.drop_table("location")
