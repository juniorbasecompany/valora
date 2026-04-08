# Testes de triggers de auditoria (PostgreSQL com schema migrado).

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from valora_backend.audit_request import (
    apply_audit_gucs_for_session,
    set_request_audit_state,
)
from valora_backend.config import Settings
from valora_backend.db import get_session
from valora_backend.model.identity import Account, Scope, Tenant
from valora_backend.model.log import Log


@pytest.fixture
def pg_session() -> Session:
    settings = Settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    if engine.dialect.name != "postgresql":
        pytest.skip("URL de banco nao e PostgreSQL")
    try:
        with engine.connect() as connection:
            connection.execute(select(1))
    except DBAPIError as exc:
        engine.dispose()
        pytest.skip(f"PostgreSQL indisponivel para testes de auditoria: {exc}")
    SessionPG = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionPG()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _create_account(pg_session: Session, *, suffix: str) -> Account:
    account = Account(
        name="Audit Actor",
        email=f"audit-{suffix}@example.com",
        provider="test",
        provider_subject=f"audit-{suffix}",
    )
    pg_session.add(account)
    pg_session.commit()
    pg_session.refresh(account)
    return account


def _create_tenant(pg_session: Session, *, suffix: str, account: Account) -> Tenant:
    tenant = Tenant(
        name=f"Audit Tenant {suffix}",
    )
    pg_session.add(tenant)
    apply_audit_gucs_for_session(pg_session, None, account.id)
    pg_session.commit()
    pg_session.refresh(tenant)
    return tenant


def _create_scope(
    pg_session: Session,
    *,
    tenant: Tenant,
    account: Account,
    name: str,
) -> Scope:
    scope = Scope(
        name=name,
        tenant_id=tenant.id,
    )
    pg_session.add(scope)
    apply_audit_gucs_for_session(pg_session, tenant.id, account.id)
    pg_session.commit()
    pg_session.refresh(scope)
    return scope


def _delete_scope(
    pg_session: Session, *, scope_id: int, tenant_id: int, account_id: int
) -> None:
    scope = pg_session.get(Scope, scope_id)
    if scope is None:
        return
    apply_audit_gucs_for_session(pg_session, tenant_id, account_id)
    pg_session.delete(scope)
    pg_session.commit()


def _delete_tenant(pg_session: Session, *, tenant_id: int, account_id: int) -> None:
    tenant = pg_session.get(Tenant, tenant_id)
    if tenant is None:
        return
    apply_audit_gucs_for_session(pg_session, tenant_id, account_id)
    pg_session.delete(tenant)
    pg_session.commit()


def _delete_account(pg_session: Session, *, account_id: int) -> None:
    account = pg_session.get(Account, account_id)
    if account is None:
        return
    apply_audit_gucs_for_session(pg_session, None, account_id)
    pg_session.delete(account)
    pg_session.commit()


def test_audit_log_after_insert_scope_with_set_config(pg_session: Session) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"scope-insert-{suffix}")
    tenant = _create_tenant(
        pg_session, suffix=f"scope-insert-{suffix}", account=account
    )
    scope: Scope | None = None
    try:
        before = pg_session.scalar(select(Log.id).order_by(Log.id.desc()).limit(1))
        scope = _create_scope(
            pg_session,
            tenant=tenant,
            account=account,
            name="s1",
        )

        row = pg_session.scalar(
            select(Log)
            .where(
                Log.table_name == "scope",
                Log.action_type == "I",
                Log.tenant_id == tenant.id,
                Log.account_id == account.id,
            )
            .order_by(Log.id.desc())
            .limit(1)
        )
        assert row is not None
        assert row.tenant_id == tenant.id
        assert row.account_id == account.id
        assert row.row_payload is not None
        assert row.row_payload.get("name") == "s1"
        assert row.row_id == scope.id
        if before is not None:
            assert row.id > before
    finally:
        if scope is not None:
            _delete_scope(
                pg_session,
                scope_id=scope.id,
                tenant_id=tenant.id,
                account_id=account.id,
            )
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)


def test_audit_log_delete_has_null_row(pg_session: Session) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"scope-delete-{suffix}")
    tenant = _create_tenant(
        pg_session, suffix=f"scope-delete-{suffix}", account=account
    )
    scope = _create_scope(
        pg_session,
        tenant=tenant,
        account=account,
        name="to-del",
    )
    scope_id = scope.id
    try:
        apply_audit_gucs_for_session(pg_session, tenant.id, account.id)
        scope_del = pg_session.get(Scope, scope_id)
        assert scope_del is not None
        pg_session.delete(scope_del)
        pg_session.commit()

        row = pg_session.scalar(
            select(Log)
            .where(
                Log.table_name == "scope",
                Log.action_type == "D",
                Log.tenant_id == tenant.id,
                Log.account_id == account.id,
            )
            .order_by(Log.id.desc())
            .limit(1)
        )
        assert row is not None
        assert row.row_payload is None
        assert row.row_id == scope_id
        assert row.tenant_id == tenant.id
        assert row.account_id == account.id
    finally:
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)


def test_audit_scope_insert_without_context_fails(pg_session: Session) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"scope-nocontext-{suffix}")
    tenant = _create_tenant(
        pg_session, suffix=f"scope-nocontext-{suffix}", account=account
    )
    try:
        pg_session.add(
            Scope(
                name="missing-context",
                tenant_id=tenant.id,
            )
        )
        with pytest.raises(DBAPIError, match="Audit context missing tenant_id"):
            pg_session.commit()
        pg_session.rollback()
    finally:
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)


def test_audit_account_update_clears_stale_tenant_context(pg_session: Session) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"account-update-{suffix}")
    tenant = _create_tenant(
        pg_session, suffix=f"account-update-{suffix}", account=account
    )
    try:
        apply_audit_gucs_for_session(pg_session, tenant.id, account.id)
        apply_audit_gucs_for_session(pg_session, None, account.id)
        account.name = "Audit Actor Updated"
        pg_session.add(account)
        pg_session.commit()

        row = pg_session.scalar(
            select(Log)
            .where(
                Log.table_name == "account",
                Log.action_type == "U",
                Log.account_id == account.id,
            )
            .order_by(Log.id.desc())
            .limit(1)
        )
        assert row is not None
        assert row.account_id == account.id
        assert row.tenant_id is None
        assert row.row_id == account.id
    finally:
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)


def test_audit_log_keeps_historical_ids_after_parent_delete(
    pg_session: Session,
) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"history-{suffix}")
    tenant = _create_tenant(pg_session, suffix=f"history-{suffix}", account=account)
    try:
        scope = _create_scope(
            pg_session,
            tenant=tenant,
            account=account,
            name="history-scope",
        )
        historical_row = pg_session.scalar(
            select(Log)
            .where(
                Log.table_name == "scope",
                Log.action_type == "I",
                Log.tenant_id == tenant.id,
                Log.account_id == account.id,
            )
            .order_by(Log.id.desc())
            .limit(1)
        )
        assert historical_row is not None
        assert historical_row.row_id == scope.id
        historical_log_id = historical_row.id

        _delete_scope(
            pg_session,
            scope_id=scope.id,
            tenant_id=tenant.id,
            account_id=account.id,
        )
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)

        preserved_row = pg_session.get(Log, historical_log_id)
        assert preserved_row is not None
        assert preserved_row.tenant_id == tenant.id
        assert preserved_row.account_id == account.id
    finally:
        _delete_scope(
            pg_session,
            scope_id=getattr(locals().get("scope"), "id", -1),
            tenant_id=tenant.id,
            account_id=account.id,
        )
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)


def test_audit_session_reapplies_context_before_flush_when_request_state_arrives_late(
    pg_session: Session,
) -> None:
    suffix = uuid.uuid4().hex[:12]
    account = _create_account(pg_session, suffix=f"late-context-{suffix}")
    tenant = _create_tenant(
        pg_session, suffix=f"late-context-{suffix}", account=account
    )
    scope = _create_scope(
        pg_session,
        tenant=tenant,
        account=account,
        name="late-context",
    )

    request = SimpleNamespace(state=SimpleNamespace())
    session_gen = get_session(request)
    session = next(session_gen)
    try:
        scope_for_update = session.get(Scope, scope.id)
        assert scope_for_update is not None

        set_request_audit_state(
            request,
            tenant_id=tenant.id,
            account_id=account.id,
        )
        scope_for_update.name = "late-context-updated"
        session.add(scope_for_update)
        session.commit()

        pg_session.expire_all()
        row = pg_session.scalar(
            select(Log)
            .where(
                Log.table_name == "scope",
                Log.action_type == "U",
                Log.tenant_id == tenant.id,
                Log.account_id == account.id,
            )
            .order_by(Log.id.desc())
            .limit(1)
        )
        assert row is not None
        assert row.row_payload is not None
        assert row.row_payload.get("name") == "late-context-updated"
        assert row.row_id == scope.id
    finally:
        session.rollback()
        session_gen.close()
        _delete_scope(
            pg_session,
            scope_id=scope.id,
            tenant_id=tenant.id,
            account_id=account.id,
        )
        _delete_tenant(pg_session, tenant_id=tenant.id, account_id=account.id)
        _delete_account(pg_session, account_id=account.id)
