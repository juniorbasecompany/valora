# Listener before_flush: grava linhas na tabela log. Comentários em PT-BR.

from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session

from valora_backend.audit.context import (
    get_audit_context,
    get_audit_processing,
    reset_audit_processing,
    set_audit_processing,
)
from valora_backend.audit.serialize import entity_to_audit_dict
from valora_backend.model.log import Log

AUDITED_TABLE_NAME_SET = frozenset(
    {"tenant", "account", "member", "scope", "location", "unity"},
)

_listener_registered = False


def _is_audited_entity(instance: object) -> bool:
    if isinstance(instance, Log):
        return False
    table = getattr(type(instance), "__tablename__", None)
    return isinstance(table, str) and table in AUDITED_TABLE_NAME_SET


def _before_flush(session: Session, _flush_context: object, _instances: object) -> None:
    """
    Sem contexto (account_id + tenant_id) não grava log — evita NOT NULL sem actor.
    Reentrância: ao adicionar instâncias Log não voltar a auditar.
    """
    if get_audit_processing():
        return

    ctx = get_audit_context()
    if ctx is None:
        return

    new_list = [o for o in session.new if _is_audited_entity(o)]
    dirty_list = [o for o in session.dirty if _is_audited_entity(o)]
    deleted_list = [o for o in session.deleted if _is_audited_entity(o)]

    if not new_list and not dirty_list and not deleted_list:
        return

    new_id_set = {id(o) for o in new_list}
    deleted_id_set = {id(o) for o in deleted_list}

    processing_token = set_audit_processing(True)
    try:
        for obj in deleted_list:
            # Omitir row_payload: em SQLite o tipo JSON pode serializar None como string
            # inválida para o CHECK (row IS NULL); coluna omitida no INSERT vira NULL na BD.
            session.add(
                Log(
                    account_id=ctx.account_id,
                    tenant_id=ctx.tenant_id,
                    table_name=obj.__tablename__,
                    action_type="D",
                )
            )

        for obj in new_list:
            session.add(
                Log(
                    account_id=ctx.account_id,
                    tenant_id=ctx.tenant_id,
                    table_name=obj.__tablename__,
                    action_type="I",
                    row_payload=entity_to_audit_dict(obj),
                )
            )

        for obj in dirty_list:
            if id(obj) in new_id_set or id(obj) in deleted_id_set:
                continue
            session.add(
                Log(
                    account_id=ctx.account_id,
                    tenant_id=ctx.tenant_id,
                    table_name=obj.__tablename__,
                    action_type="U",
                    row_payload=entity_to_audit_dict(obj),
                )
            )
    finally:
        reset_audit_processing(processing_token)


def register_audit_listener() -> None:
    """Idempotente: regista um único listener global na classe Session."""
    global _listener_registered
    if _listener_registered:
        return
    event.listen(Session, "before_flush", _before_flush)
    _listener_registered = True
