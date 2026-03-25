"""log.row nullable for delete; CHECK enforces payload by action

Revision ID: c7d9e1f3a2b4
Revises: e4a2c8f0d1b3
Create Date: 2026-03-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = "c7d9e1f3a2b4"
down_revision: Union[str, Sequence[str], None] = "e4a2c8f0d1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "log",
        "row",
        existing_type=JSONB(),
        nullable=True,
        comment="Conteúdo da linha. NULL em caso de delete.",
    )
    op.execute(sa.text("UPDATE log SET \"row\" = NULL WHERE action_type = 'D'"))
    op.create_check_constraint(
        "log_row_payload_by_action_chk",
        "log",
        "(action_type = 'D' AND \"row\" IS NULL) "
        "OR (action_type IN ('I', 'U') AND \"row\" IS NOT NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("log_row_payload_by_action_chk", "log", type_="check")
    op.execute(
        sa.text(
            "UPDATE log SET \"row\" = CAST('{}' AS JSONB) "
            "WHERE action_type = 'D' AND \"row\" IS NULL"
        )
    )
    op.alter_column(
        "log",
        "row",
        existing_type=JSONB(),
        nullable=False,
        comment="Conteúdo da linha; JSON vazio em caso de delete.",
    )
