"""scope_rules_domain

Revision ID: 9b57df201f8a
Revises: f3a0b1c2d3e4
Create Date: 2026-03-30 01:54:38.526567

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
# revision identifiers, used by Alembic.
revision: str = '9b57df201f8a'
down_revision: Union[str, Sequence[str], None] = 'f3a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LOG_TABLE_NAMES = (
    "'account', 'action', 'event', 'field', 'formula', 'input', 'label', 'location', 'member', 'result', 'scope', 'tenant', 'unity'"
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
    'member', 'scope', 'location', 'unity',
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

_AUDIT_FUNCTION_PRE_RULES_DDL = r"""

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

  IF TG_TABLE_NAME IN ('member', 'scope', 'location', 'unity') THEN
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


_NEW_TRIGGERS = [
    """
    CREATE TRIGGER field_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON field
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER action_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON "action"
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER formula_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON formula
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER label_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON label
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER event_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON "event"
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER input_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON "input"
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
    """
    CREATE TRIGGER result_valora_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON "result"
    FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();
    """,
]

_DROP_NEW_TRIGGERS = [
    "DROP TRIGGER IF EXISTS field_valora_audit_trg ON field;",
    'DROP TRIGGER IF EXISTS action_valora_audit_trg ON "action";',
    "DROP TRIGGER IF EXISTS formula_valora_audit_trg ON formula;",
    "DROP TRIGGER IF EXISTS label_valora_audit_trg ON label;",
    'DROP TRIGGER IF EXISTS event_valora_audit_trg ON "event";',
    'DROP TRIGGER IF EXISTS input_valora_audit_trg ON "input";',
    'DROP TRIGGER IF EXISTS result_valora_audit_trg ON "result";',
]

def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('action',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador da ação. A ação pode ter uma ou mais fórmulas associadas.'),
    sa.Column('scope_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com o escopo.'),
    sa.ForeignKeyConstraint(['scope_id'], ['scope.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    comment='Tabela para definir as ações. Ex: Alojamento, Mortalidade, etc...'
    )
    op.create_table('field',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador da definição do campo.'),
    sa.Column('scope_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com o escopo em que estamos trabalhando.'),
    sa.Column('type', sa.Text(), nullable=False, comment='Tipo do valor armazenado, considerando o padrão do dados do Postgres para tipo SQL completo como INTEGER, NUMERIC( 15, 2 ), BOOLEAN, etc.'),
    sa.ForeignKeyConstraint(['scope_id'], ['scope.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Definição do campo. Ex: quantidade, mortes, valor'
    )
    op.create_table('event',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador do evento.'),
    sa.Column('location_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação ao local.'),
    sa.Column('unity_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação à unidade produtiva.'),
    sa.Column('moment_utc', sa.DateTime(), server_default=sa.text("(now() AT TIME ZONE 'UTC')"), nullable=False, comment='Momento do evento ou da medição.'),
    sa.Column('action_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação à ação.'),
    sa.ForeignKeyConstraint(['action_id'], ['action.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['location_id'], ['location.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['unity_id'], ['unity.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    comment='É o momento em que determinada fórmula é aplicada.'
    )
    op.create_table('formula',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador da fórmula.'),
    sa.Column('action_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Identificação da ação.'),
    sa.Column('step', sa.Integer(), nullable=False, comment='Ordem que as fórmulas devem ser executadas. UNIQUE por action_id + step.'),
    sa.Column('statement', sa.Text(), nullable=False, comment='Instrução matemática. Ex: ${field:1} = ${field:1} * ${field:2}, que para o usuário, será mostrado como: Mortalidade = Quantidade * Fator'),
    sa.ForeignKeyConstraint(['action_id'], ['action.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('action_id', 'step', name='formula_action_step_unique'),
    comment='Fórmula que deve ser aplicada aos eventos da ação.'
    )
    op.create_table('label',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador do registro de valor.'),
    sa.Column('lang', sa.Text(), nullable=False, comment='Identificação da linguagem.'),
    sa.Column('name', sa.Text(), nullable=False, comment='Nome amigável do campo ou da ação.'),
    sa.Column('field_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=True, comment='LIgação com o campo. Nem sempre está informado, pois pode estar ligado à ação.'),
    sa.Column('action_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=True, comment='LIgação com a ação. Nem sempre está informado, pois pode estar ligado ao campo.'),
    sa.CheckConstraint("lang IN ('pt-BR', 'en', 'es')", name='label_lang_chk'),
    sa.CheckConstraint('(field_id IS NOT NULL AND action_id IS NULL) OR (field_id IS NULL AND action_id IS NOT NULL)', name='label_field_xor_action_chk'),
    sa.ForeignKeyConstraint(['action_id'], ['action.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['field_id'], ['field.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Serve basicamente para dar um nome amigável para o campo ou para a ação. Exatamente um entre field_id e action_id deve estar preenchido.\nunique por (lang, field_id) e por (lang, action_id)'
    )
    op.create_index('label_unique_lang_action', 'label', ['lang', 'action_id'], unique=True, sqlite_where=sa.text('action_id IS NOT NULL'), postgresql_where=sa.text('action_id IS NOT NULL'))
    op.create_index('label_unique_lang_field', 'label', ['lang', 'field_id'], unique=True, sqlite_where=sa.text('field_id IS NOT NULL'), postgresql_where=sa.text('field_id IS NOT NULL'))
    op.create_table('input',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador do parâmetro de entrada da ação.'),
    sa.Column('event_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com o evento onde o parâmetro de entrada deverá ser solicitado ao usuário.'),
    sa.Column('field_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com a definição do campo. Este é o campo de entrada da ação.'),
    sa.Column('value', sa.Text(), nullable=False, comment='Este é o valor do parâmetro, representado em um formato que pode ser convertido de \'text\' para o formato nativo do postgres, indicado no campo field.type. Ex: "123" poderá ser convertido para o numérico 123.00 se o field.type for "NUMERIC( 10, 2 )"'),
    sa.ForeignKeyConstraint(['event_id'], ['event.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['field_id'], ['field.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    comment='Aqui ficam registrados os valores dos parâmetros de entrada das ações aplicadas aos eventos em cada dia.'
    )
    op.create_table('result',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False, comment='Identificador do resultado da fórmula aplicada ao evento.'),
    sa.Column('event_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com o evento onde o resultado da fórmula foi aplicado.'),
    sa.Column('value', sa.Text(), nullable=False, comment='Este é o valor resultado da aplicação da fórmula em determinado evento. É gravado no formato \'text\'. Este valor, submetido field.type, volta ao tipo nativo do postgres. Ex: "123" será convertido para inteiro se field.type for "INTEGER"'),
    sa.Column('parent_result_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=True, comment='Ligação com o result anterior. Se o result pai for apagado ou modificado, todo os filhos devem ser apagados.'),
    sa.Column('moment_utc', sa.DateTime(), nullable=False, comment='Este é o momento em que o cálculo foi efetuado.'),
    sa.Column('field_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False, comment='Ligação com a definição do campo. Este campo é o resultado da aplicação da fórmula em determinado evento.'),
    sa.ForeignKeyConstraint(['event_id'], ['event.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['field_id'], ['field.id'], onupdate='CASCADE', ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['parent_result_id'], ['result.id'], onupdate='CASCADE', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Aqui ficam registrados os resultados das fórmulas aplicadas aos eventos em cada dia.'
    )
    op.drop_constraint("log_table_name_chk", "log", type_="check")
    op.create_check_constraint(
        "log_table_name_chk",
        "log",
        f"table_name IN ({_LOG_TABLE_NAMES})",
    )
    op.execute(_AUDIT_FUNCTION_WITH_RULES_DDL)
    for stmt in _NEW_TRIGGERS:
        op.execute(stmt)

    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    for stmt in _DROP_NEW_TRIGGERS:
        op.execute(stmt)

    op.execute(_AUDIT_FUNCTION_PRE_RULES_DDL)

    op.drop_constraint("log_table_name_chk", "log", type_="check")
    op.create_check_constraint(
        "log_table_name_chk",
        "log",
        "table_name IN ("
        "'tenant', 'account', 'member', 'scope', 'location', 'unity')",
    )

    op.drop_table("result")
    op.drop_table("input")
    op.drop_index("label_unique_lang_field", table_name="label", sqlite_where=sa.text("field_id IS NOT NULL"), postgresql_where=sa.text("field_id IS NOT NULL"))
    op.drop_index("label_unique_lang_action", table_name="label", sqlite_where=sa.text("action_id IS NOT NULL"), postgresql_where=sa.text("action_id IS NOT NULL"))
    op.drop_table("label")
    op.drop_table("formula")
    op.drop_table("event")
    op.drop_table("field")
    op.drop_table("action")