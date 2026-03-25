from __future__ import annotations

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from valora_backend.audit.context import (
    clear_audit_context,
    reset_audit_context,
    set_audit_context,
)
from valora_backend.model.base import Base
from valora_backend.model.identity import Account, Member, Scope, Tenant
from valora_backend.model.log import Log


@pytest.fixture
def audit_session() -> Generator[Session, None, None]:
    from valora_backend.audit.session_listener import register_audit_listener

    register_audit_listener()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _sqlite_enable_foreign_keys(dbapi_connection, _connection_record) -> None:
        if engine.dialect.name == "sqlite":
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()
        clear_audit_context()
        engine.dispose()


def test_no_audit_context_means_no_log_row(audit_session: Session) -> None:
    tenant = Tenant(name="T", display_name="T")
    audit_session.add(tenant)
    audit_session.commit()

    count = audit_session.scalar(select(func.count()).select_from(Log))
    assert count == 0


def test_insert_update_delete_emit_log_with_row_rules(audit_session: Session) -> None:
    tenant = Tenant(name="T", display_name="T")
    account = Account(
        name="A",
        display_name="A",
        email="a@x.com",
        provider="google",
        provider_subject="sub-1",
    )
    audit_session.add_all([tenant, account])
    audit_session.commit()

    member = Member(
        name="M",
        display_name="M",
        email="m@x.com",
        tenant_id=tenant.id,
        account_id=account.id,
        role=3,
        status=1,
    )
    audit_session.add(member)
    audit_session.commit()

    ctx = set_audit_context(account_id=account.id, tenant_id=tenant.id)
    try:
        scope = Scope(
            name="S1",
            display_name="S1 long",
            tenant_id=tenant.id,
        )
        audit_session.add(scope)
        audit_session.commit()
    finally:
        reset_audit_context(ctx)

    log_i = audit_session.scalars(
        select(Log).where(Log.table_name == "scope", Log.action_type == "I")
    ).first()
    assert log_i is not None
    assert log_i.row_payload is not None
    assert log_i.row_payload.get("name") == "S1"

    ctx = set_audit_context(account_id=account.id, tenant_id=tenant.id)
    try:
        scope = audit_session.get(Scope, scope.id)
        assert scope is not None
        scope.display_name = "changed"
        audit_session.commit()
    finally:
        reset_audit_context(ctx)

    log_u = audit_session.scalars(
        select(Log).where(Log.table_name == "scope", Log.action_type == "U")
    ).first()
    assert log_u is not None
    assert log_u.row_payload is not None
    assert log_u.row_payload.get("display_name") == "changed"

    ctx = set_audit_context(account_id=account.id, tenant_id=tenant.id)
    try:
        scope = audit_session.get(Scope, scope.id)
        assert scope is not None
        audit_session.delete(scope)
        audit_session.commit()
    finally:
        reset_audit_context(ctx)

    log_d = audit_session.scalars(
        select(Log).where(Log.table_name == "scope", Log.action_type == "D")
    ).first()
    assert log_d is not None
    assert log_d.row_payload is None


def test_log_entity_is_not_audited(audit_session: Session) -> None:
    tenant = Tenant(name="T2", display_name="T2")
    account = Account(
        name="A2",
        display_name="A2",
        email="a2@x.com",
        provider="google",
        provider_subject="sub-2",
    )
    audit_session.add_all([tenant, account])
    audit_session.commit()

    ctx = set_audit_context(account_id=account.id, tenant_id=tenant.id)
    try:
        scope = Scope(name="Sx", display_name="Sx", tenant_id=tenant.id)
        audit_session.add(scope)
        audit_session.commit()
    finally:
        reset_audit_context(ctx)

    log_about_table = audit_session.scalar(
        select(func.count()).select_from(Log).where(Log.table_name == "log")
    )
    assert log_about_table == 0
