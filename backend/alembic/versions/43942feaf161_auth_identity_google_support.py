"""auth identity google support

Revision ID: 43942feaf161
Revises: 14f30d992bff
Create Date: 2026-03-21 05:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "43942feaf161"
down_revision: Union[str, Sequence[str], None] = "14f30d992bff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "account",
        sa.Column(
            "provider_subject",
            sa.Text(),
            nullable=True,
            comment="Identificador estável da conta no provedor de autenticação.",
        ),
    )
    op.execute("UPDATE account SET provider_subject = email WHERE provider_subject IS NULL")
    op.alter_column("account", "provider_subject", nullable=False)
    op.create_unique_constraint("account_unique_email", "account", ["email"])
    op.create_unique_constraint(
        "account_unique_provider_subject",
        "account",
        ["provider", "provider_subject"],
    )

    op.add_column(
        "member",
        sa.Column(
            "role",
            sa.Integer(),
            sa.CheckConstraint("role IN (1, 2, 3)"),
            nullable=True,
            server_default=sa.text("3"),
            comment="Papel do usuário no licenciado: 1 master, 2 admin, 3 member.",
        ),
    )
    op.execute("UPDATE member SET role = 3 WHERE role IS NULL")
    op.alter_column("member", "role", nullable=False, server_default=sa.text("3"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("member", "role")

    op.drop_constraint(
        "account_unique_provider_subject",
        "account",
        type_="unique",
    )
    op.drop_constraint("account_unique_email", "account", type_="unique")
    op.drop_column("account", "provider_subject")
