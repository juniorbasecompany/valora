"""event: remove age_field_id; CHECK unity_id e moment_utc em paridade

Revision ID: d5e6f7a8b9c0
Revises: b4e6f8a0c2d1
Create Date: 2026-04-09

- Remove event.age_field_id (discriminação fato/padrão passa a ser só unity_id/moment_utc).
- Garante (unity_id IS NULL <=> moment_utc IS NULL) via CHECK event_unity_moment_pair.
- Dados: padroniza linhas de padrão antigas (tinham age_field_id) para unity_id/moment_utc NULL;
  remove moment órfão quando unity_id é NULL.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "b4e6f8a0c2d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # Padrão antigo: age_field_id preenchido; novo modelo exige unity_id e moment_utc NULL.
    op.execute(
        sa.text(
            "UPDATE event SET unity_id = NULL, moment_utc = NULL "
            "WHERE age_field_id IS NOT NULL"
        )
    )
    # Legado: fato sem unidade (moment sem unity); novo modelo não permite moment sem unity.
    op.execute(
        sa.text(
            "UPDATE event SET moment_utc = NULL "
            "WHERE unity_id IS NULL AND moment_utc IS NOT NULL"
        )
    )
    orphan = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM event WHERE unity_id IS NOT NULL AND moment_utc IS NULL"
        )
    ).scalar()
    if orphan and int(orphan) > 0:
        raise RuntimeError(
            "event: existem linhas com unity_id preenchido e moment_utc NULL; "
            "corrija manualmente antes de aplicar esta migração."
        )

    op.drop_constraint("event_age_field_id_fkey", "event", type_="foreignkey")
    op.drop_column("event", "age_field_id")

    op.create_check_constraint(
        "event_unity_moment_pair",
        "event",
        "(unity_id IS NULL AND moment_utc IS NULL) OR "
        "(unity_id IS NOT NULL AND moment_utc IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("event_unity_moment_pair", "event", type_="check")

    op.add_column(
        "event",
        sa.Column(
            "age_field_id",
            sa.BigInteger(),
            nullable=True,
            comment=(
                "Indica o campo de idade usado em eventos-padrão (standard). "
                "Quando presente, o evento não tem unity_id nem moment_utc."
            ),
        ),
    )
    op.create_foreign_key(
        "event_age_field_id_fkey",
        "event",
        "field",
        ["age_field_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="RESTRICT",
    )
