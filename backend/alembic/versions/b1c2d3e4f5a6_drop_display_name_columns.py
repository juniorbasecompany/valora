"""Remove display_name columns (aligned with backend/erd.json).

Revision ID: b1c2d3e4f5a6
Revises: a7c1d9e4f2b6
Create Date: 2026-04-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a7c1d9e4f2b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Migração de dados sem contexto GUC de auditoria: desativa triggers por linha.
    audit_trigger_list = [
        ("tenant", "tenant_valora_audit_trg"),
        ("account", "account_valora_audit_trg"),
        ("scope", "scope_valora_audit_trg"),
        ("location", "location_valora_audit_trg"),
        ("kind", "kind_valora_audit_trg"),
        ("member", "member_valora_audit_trg"),
    ]
    for table_name, trigger_name in audit_trigger_list:
        op.execute(f'ALTER TABLE "{table_name}" DISABLE TRIGGER {trigger_name}')

    try:
        # Mescla conteúdo útil em `name` antes de dropar `display_name`.
        op.execute(
            """
            UPDATE tenant SET name = COALESCE(NULLIF(trim(name), ''), trim(display_name))
            """
        )
        op.execute(
            """
            UPDATE account SET name = COALESCE(NULLIF(trim(name), ''), trim(display_name))
            """
        )
        op.execute(
            """
            UPDATE scope SET name = COALESCE(NULLIF(trim(name), ''), trim(display_name))
            """
        )
        op.execute(
            """
            UPDATE location SET name = COALESCE(NULLIF(trim(name), ''), trim(display_name))
            """
        )
        op.execute(
            """
            UPDATE kind SET name = COALESCE(NULLIF(trim(name), ''), trim(display_name))
            """
        )
        op.execute(
            """
            UPDATE member SET name = COALESCE(
                NULLIF(trim(name), ''),
                NULLIF(trim(display_name), '')
            )
            """
        )

        op.drop_constraint("kind_scope_display_name_unique", "kind", type_="unique")

        op.drop_column("kind", "display_name")
        op.drop_column("location", "display_name")
        op.drop_column("scope", "display_name")
        op.drop_column("tenant", "display_name")
        op.drop_column("account", "display_name")
        op.drop_column("member", "display_name")
    finally:
        for table_name, trigger_name in reversed(audit_trigger_list):
            op.execute(f'ALTER TABLE "{table_name}" ENABLE TRIGGER {trigger_name}')


def downgrade() -> None:
    audit_trigger_list = [
        ("tenant", "tenant_valora_audit_trg"),
        ("account", "account_valora_audit_trg"),
        ("scope", "scope_valora_audit_trg"),
        ("location", "location_valora_audit_trg"),
        ("kind", "kind_valora_audit_trg"),
        ("member", "member_valora_audit_trg"),
    ]
    op.add_column(
        "member",
        sa.Column("display_name", sa.Text(), nullable=True, comment="Nome do usuário."),
    )
    op.add_column(
        "account",
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=True,
            comment="Nome do usuário da conta.",
        ),
    )
    op.add_column(
        "tenant",
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=True,
            comment="Nome do licenciado.",
        ),
    )
    op.add_column(
        "scope",
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=True,
            comment="Descrição do escopo.",
        ),
    )
    op.add_column(
        "location",
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=True,
            comment="Descrição do local com mais contexto para a operação.",
        ),
    )
    op.add_column(
        "kind",
        sa.Column(
            "display_name",
            sa.Text(),
            nullable=True,
            comment="Nome amigável do tipo de item.",
        ),
    )

    for table_name, trigger_name in audit_trigger_list:
        op.execute(f'ALTER TABLE "{table_name}" DISABLE TRIGGER {trigger_name}')
    try:
        op.execute("UPDATE account SET display_name = name WHERE display_name IS NULL")
        op.execute("UPDATE tenant SET display_name = name WHERE display_name IS NULL")
        op.execute("UPDATE scope SET display_name = name WHERE display_name IS NULL")
        op.execute("UPDATE location SET display_name = name WHERE display_name IS NULL")
        op.execute("UPDATE kind SET display_name = name WHERE display_name IS NULL")
        op.execute("UPDATE member SET display_name = name WHERE display_name IS NULL")

        op.alter_column("account", "display_name", nullable=False)
        op.alter_column("tenant", "display_name", nullable=False)
        op.alter_column("scope", "display_name", nullable=False)
        op.alter_column("location", "display_name", nullable=False)
        op.alter_column("kind", "display_name", nullable=False)

        op.create_unique_constraint(
            "kind_scope_display_name_unique",
            "kind",
            ["scope_id", "display_name"],
        )
    finally:
        for table_name, trigger_name in reversed(audit_trigger_list):
            op.execute(f'ALTER TABLE "{table_name}" ENABLE TRIGGER {trigger_name}')
