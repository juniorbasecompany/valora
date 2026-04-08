"""Trigger de consistência event ↔ unity (location_id e item_id)

Revision ID: a2b3c4d5e6f7
Revises: f4a5b6c7d8e9
Create Date: 2026-04-08

Quando event.unity_id está preenchido, garante que:
 - event.location_id = unity.location_id
 - event.item_id ∈ unity.item_id_list
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CREATE_FUNCTION = """\
CREATE OR REPLACE FUNCTION validate_event_unity_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_location_id BIGINT;
    v_item_id_list BIGINT[];
BEGIN
    IF NEW.unity_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT location_id, item_id_list
    INTO v_location_id, v_item_id_list
    FROM unity
    WHERE id = NEW.unity_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
          'event.unity_id (%) references a non-existent unity',
          NEW.unity_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.location_id IS DISTINCT FROM v_location_id THEN
        RAISE EXCEPTION
          'event.location_id (%) must equal unity.location_id (%) when unity_id is set',
          NEW.location_id, v_location_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (NEW.item_id = ANY(v_item_id_list)) THEN
        RAISE EXCEPTION
          'event.item_id (%) must be in unity.item_id_list when unity_id is set',
          NEW.item_id
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

_CREATE_TRIGGER = """\
CREATE TRIGGER event_unity_consistency_trg
BEFORE INSERT OR UPDATE ON "event"
FOR EACH ROW EXECUTE FUNCTION validate_event_unity_consistency();
"""


def upgrade() -> None:
    op.execute(_CREATE_FUNCTION)
    op.execute(_CREATE_TRIGGER)


def downgrade() -> None:
    op.execute('DROP TRIGGER IF EXISTS event_unity_consistency_trg ON "event"')
    op.execute("DROP FUNCTION IF EXISTS validate_event_unity_consistency()")
