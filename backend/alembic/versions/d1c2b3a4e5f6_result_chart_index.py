"""result: índice composto (unity_id, field_id, age) para agregação da home.

Revision ID: d1c2b3a4e5f6
Revises: e5f6a7b8c9d0
Create Date: 2026-04-18

- Cria índice `result_unity_field_age_idx` em `result(unity_id, field_id, age)`
  para acelerar a agregação por (unity_id, field_id, age) usada pelo endpoint
  `/scopes/{scope_id}/home/chart-series`.
- Idempotente: se o índice já existir com mesmo nome, não recria.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "d1c2b3a4e5f6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "result_unity_field_age_idx"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            text(
                f'CREATE INDEX IF NOT EXISTS "{INDEX_NAME}" '
                'ON "result" ("unity_id", "field_id", "age")'
            )
        )
    else:
        op.execute(
            text(
                f'CREATE INDEX IF NOT EXISTS "{INDEX_NAME}" '
                "ON result (unity_id, field_id, age)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(text(f'DROP INDEX IF EXISTS "{INDEX_NAME}"'))
    else:
        op.execute(text(f'DROP INDEX IF EXISTS "{INDEX_NAME}"'))
