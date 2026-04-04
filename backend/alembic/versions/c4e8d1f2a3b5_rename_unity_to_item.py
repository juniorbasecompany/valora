"""rename unity table to item; event.unity_id to item_id; audit and log check

Revision ID: c4e8d1f2a3b5
Revises: b3d5f7a9c1e2
Create Date: 2026-04-04

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e8d1f2a3b5"
down_revision: Union[str, Sequence[str], None] = "b3d5f7a9c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LOG_TABLE_NAMES = (
    "'account', 'action', 'event', 'field', 'formula', 'input', 'label', 'location', "
    "'member', 'result', 'scope', 'tenant', 'item'"
)

_AUDIT_FUNCTION_WITH_RULES_DDL = r"""
CREATE OR REPLACE FUNCTION valora_audit_row_to_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_tenant_id bigint;
  v_account_id bigint;
  v_row jsonb;
  v_action text;
  v_row_id bigint;
  v_raw text;
  v_tenant_required boolean := false;
  v_account_required boolean := false;
BEGIN
  BEGIN
    v_raw := current_setting('valora.current_tenant_id', true);
    IF v_raw IS NULL OR btrim(v_raw) = '' THEN
      v_tenant_id := NULL;
    ELSE
      v_tenant_id := v_raw::bigint;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_tenant_id := NULL;
  END;

  BEGIN
    v_raw := current_setting('valora.current_account_id', true);
    IF v_raw IS NULL OR btrim(v_raw) = '' THEN
      v_account_id := NULL;
    ELSE
      v_account_id := v_raw::bigint;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_account_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_action := 'D';
    v_row := NULL;
    v_row_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'U';
    v_row := row_to_json(NEW)::jsonb;
    v_row_id := NEW.id;
  ELSE
    v_action := 'I';
    v_row := row_to_json(NEW)::jsonb;
    v_row_id := NEW.id;
  END IF;

  IF TG_TABLE_NAME IN (
    'member', 'scope', 'location', 'item',
    'field', 'action', 'formula', 'label', 'event', 'input', 'result'
  ) THEN
    v_tenant_required := true;
    v_account_required := true;
  ELSIF TG_TABLE_NAME = 'tenant' THEN
    v_tenant_required := TG_OP <> 'INSERT';
    v_account_required := true;
  ELSIF TG_TABLE_NAME = 'account' THEN
    v_tenant_required := false;
    v_account_required := TG_OP <> 'INSERT';
  ELSE
    RAISE EXCEPTION 'Audit policy missing for table %', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF v_tenant_required AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Audit context missing tenant_id for table %, action %',
      TG_TABLE_NAME, TG_OP
      USING ERRCODE = '23514';
  END IF;

  IF v_account_required AND v_account_id IS NULL THEN
    RAISE EXCEPTION 'Audit context missing account_id for table %, action %',
      TG_TABLE_NAME, TG_OP
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO log (account_id, tenant_id, table_name, action_type, row_id, "row")
  VALUES (v_account_id, v_tenant_id, TG_TABLE_NAME, v_action, v_row_id, v_row);

  RETURN COALESCE(NEW, OLD);
END;
$fn$;
"""


def _drop_fk_event_to_unity() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for fk in inspector.get_foreign_keys("event"):
        if fk["referred_table"] == "unity" and fk["constrained_columns"] == ["unity_id"]:
            op.drop_constraint(fk["name"], "event", type_="foreignkey")
            return
    raise RuntimeError("expected FK from event.unity_id to unity not found")


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS unity_valora_audit_trg ON unity")

    _drop_fk_event_to_unity()

    op.drop_constraint("unity_parent_same_scope_fk", "unity", type_="foreignkey")
    op.drop_constraint("unity_parent_self_chk", "unity", type_="check")

    op.rename_table("unity", "item")

    op.execute("ALTER TABLE item RENAME COLUMN parent_unity_id TO parent_item_id")

    op.create_check_constraint(
        "item_parent_self_chk",
        "item",
        "parent_item_id IS NULL OR parent_item_id <> id",
    )

    op.execute("ALTER TABLE item RENAME CONSTRAINT unity_scope_id_unique TO item_scope_id_unique")

    op.create_foreign_key(
        "item_parent_same_scope_fk",
        "item",
        "item",
        ["scope_id", "parent_item_id"],
        ["scope_id", "id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )

    op.execute(
        "ALTER INDEX IF EXISTS unity_scope_parent_sort_idx RENAME TO item_scope_parent_sort_idx"
    )
    op.execute(
        "ALTER INDEX IF EXISTS unity_scope_parent_name_idx RENAME TO item_scope_parent_name_idx"
    )

    op.execute('ALTER TABLE "event" RENAME COLUMN unity_id TO item_id')

    op.create_foreign_key(
        "event_item_id_fkey",
        "event",
        "item",
        ["item_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="RESTRICT",
    )

    # Remover o CHECK antes do UPDATE: o valor novo ('item') só entra na lista na constraint seguinte.
    op.drop_constraint("log_table_name_chk", "log", type_="check")
    op.execute(sa.text("UPDATE log SET table_name = 'item' WHERE table_name = 'unity'"))
    op.create_check_constraint(
        "log_table_name_chk",
        "log",
        f"table_name IN ({_LOG_TABLE_NAMES})",
    )

    op.execute(_AUDIT_FUNCTION_WITH_RULES_DDL)

    op.execute(
        """
        CREATE TRIGGER item_valora_audit_trg
        AFTER INSERT OR UPDATE OR DELETE ON item
        FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS item_valora_audit_trg ON item")

    op.drop_constraint("event_item_id_fkey", "event", type_="foreignkey")
    op.execute('ALTER TABLE "event" RENAME COLUMN item_id TO unity_id')

    op.execute(
        "ALTER INDEX IF EXISTS item_scope_parent_sort_idx RENAME TO unity_scope_parent_sort_idx"
    )
    op.execute(
        "ALTER INDEX IF EXISTS item_scope_parent_name_idx RENAME TO unity_scope_parent_name_idx"
    )

    op.drop_constraint("item_parent_same_scope_fk", "item", type_="foreignkey")
    op.drop_constraint("item_parent_self_chk", "item", type_="check")

    op.rename_table("item", "unity")

    op.execute("ALTER TABLE unity RENAME COLUMN parent_item_id TO parent_unity_id")

    op.create_check_constraint(
        "unity_parent_self_chk",
        "unity",
        "parent_unity_id IS NULL OR parent_unity_id <> id",
    )

    op.execute("ALTER TABLE unity RENAME CONSTRAINT item_scope_id_unique TO unity_scope_id_unique")

    op.create_foreign_key(
        "unity_parent_same_scope_fk",
        "unity",
        "unity",
        ["scope_id", "parent_unity_id"],
        ["scope_id", "id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
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

    op.drop_constraint("log_table_name_chk", "log", type_="check")
    op.execute(sa.text("UPDATE log SET table_name = 'unity' WHERE table_name = 'item'"))
    op.create_check_constraint(
        "log_table_name_chk",
        "log",
        "table_name IN ("
        "'account', 'action', 'event', 'field', 'formula', 'input', 'label', 'location', "
        "'member', 'result', 'scope', 'tenant', 'unity')",
    )

    _AUDIT_UNITY = _AUDIT_FUNCTION_WITH_RULES_DDL.replace("'item'", "'unity'", 1)
    op.execute(_AUDIT_UNITY)

    op.execute(
        """
        CREATE TRIGGER unity_valora_audit_trg
        AFTER INSERT OR UPDATE OR DELETE ON unity
        FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
        """
    )
