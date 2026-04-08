"""unity.name (NOT NULL); event.unity_id (NULL, FK para unity)

Revision ID: f4a5b6c7d8e9
Revises: b1c2d3e4f5a6
Create Date: 2026-04-08

Dados legados: name preenchido com o padrão textual '#<id>' (ex.: '#42').
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.execute("ALTER TABLE unity DISABLE TRIGGER unity_valora_audit_trg")
    op.execute('ALTER TABLE "event" DISABLE TRIGGER event_valora_audit_trg')
    try:
        op.add_column(
            "unity",
            sa.Column("name", sa.Text(), nullable=True),
        )
        op.execute(
            "UPDATE unity SET name = '#' || CAST(id AS TEXT) "
            "WHERE name IS NULL OR TRIM(name) = ''"
        )
        op.alter_column(
            "unity",
            "name",
            existing_type=sa.Text(),
            nullable=False,
        )

        op.add_column(
            "event",
            sa.Column("unity_id", BIGINT, nullable=True),
        )
        op.create_foreign_key(
            "event_unity_id_fkey",
            "event",
            "unity",
            ["unity_id"],
            ["id"],
            onupdate="CASCADE",
            ondelete="RESTRICT",
        )
        op.create_index("event_unity_id_idx", "event", ["unity_id"], unique=False)
    finally:
        op.execute("ALTER TABLE unity ENABLE TRIGGER unity_valora_audit_trg")
        op.execute('ALTER TABLE "event" ENABLE TRIGGER event_valora_audit_trg')


def downgrade() -> None:
    op.execute("ALTER TABLE unity DISABLE TRIGGER unity_valora_audit_trg")
    op.execute('ALTER TABLE "event" DISABLE TRIGGER event_valora_audit_trg')
    try:
        op.drop_index("event_unity_id_idx", table_name="event")
        op.drop_constraint("event_unity_id_fkey", "event", type_="foreignkey")
        op.drop_column("event", "unity_id")
        op.drop_column("unity", "name")
    finally:
        op.execute("ALTER TABLE unity ENABLE TRIGGER unity_valora_audit_trg")
        op.execute('ALTER TABLE "event" ENABLE TRIGGER event_valora_audit_trg')
