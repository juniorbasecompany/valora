"""Listagem e criação de eventos com `event_kind` e paridade unity_id / moment_utc."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from valora_backend.auth.dependencies import get_current_member
from valora_backend.db import get_session
from valora_backend.main import create_app
from valora_backend.model.base import Base
from valora_backend.model.identity import Account, Item, Kind, Location, Member, Scope, Tenant, Unity
from valora_backend.model.rules import Action, Event, Field


@pytest.fixture
def client_session_master() -> tuple[TestClient, Session, int, int]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    testing_session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(engine)

    session = testing_session_local()
    tenant = Tenant(name="T")
    session.add(tenant)
    session.flush()

    account = Account(
        name="Master",
        email="m@example.com",
        provider="google",
        provider_subject="sub-m",
    )
    session.add(account)
    session.flush()

    member = Member(
        name="Master",
        email=account.email,
        tenant_id=tenant.id,
        account_id=account.id,
        role=1,
        status=1,
    )
    session.add(member)
    session.flush()

    scope = Scope(name="S", tenant_id=tenant.id)
    session.add(scope)
    session.flush()

    location = Location(
        name="L1",
        scope_id=scope.id,
        parent_location_id=None,
        sort_order=0,
    )
    kind = Kind(scope_id=scope.id, name="k")
    session.add_all([location, kind])
    session.flush()

    item = Item(
        scope_id=scope.id,
        kind_id=kind.id,
        parent_item_id=None,
        sort_order=0,
    )
    session.add(item)
    session.flush()

    action = Action(scope_id=scope.id, sort_order=0)
    session.add(action)
    session.flush()

    field_current = Field(
        scope_id=scope.id,
        type="INTEGER",
        sort_order=0,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=True,
    )
    field_other = Field(
        scope_id=scope.id,
        type="INTEGER",
        sort_order=1,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=False,
    )
    session.add_all([field_current, field_other])
    session.flush()

    unity = Unity(
        name="U1",
        location_id=location.id,
        item_id_list=[item.id],
        creation_utc=datetime(2026, 4, 1, 0, 0, 0),
    )
    session.add(unity)
    session.flush()

    moment = datetime(2026, 4, 2, 12, 0, 0)
    ev_fact = Event(
        unity_id=unity.id,
        location_id=location.id,
        item_id=item.id,
        action_id=action.id,
        moment_utc=moment,
    )
    ev_std = Event(
        unity_id=None,
        location_id=location.id,
        item_id=item.id,
        action_id=action.id,
        moment_utc=None,
    )
    session.add_all([ev_fact, ev_std])
    session.commit()

    app = create_app()

    def override_get_session():
        yield session

    def override_get_current_member():
        return session.get(Member, member.id)

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_member] = override_get_current_member

    test_client = TestClient(app)
    try:
        yield test_client, session, scope.id, field_other.id
    finally:
        test_client.close()
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def test_list_scope_events_event_kind_filters(
    client_session_master: tuple[TestClient, Session, int, int],
) -> None:
    client, _session, scope_id, _other_field_id = client_session_master

    r_all = client.get(f"/auth/tenant/current/scopes/{scope_id}/events")
    assert r_all.status_code == 200
    assert len(r_all.json()["item_list"]) == 2

    r_fact = client.get(f"/auth/tenant/current/scopes/{scope_id}/events?event_kind=fact")
    assert r_fact.status_code == 200
    ids_fact = {row["id"] for row in r_fact.json()["item_list"]}
    assert len(ids_fact) == 1

    r_std = client.get(f"/auth/tenant/current/scopes/{scope_id}/events?event_kind=standard")
    assert r_std.status_code == 200
    ids_std = {row["id"] for row in r_std.json()["item_list"]}
    assert len(ids_std) == 1
    assert ids_fact.isdisjoint(ids_std)


def test_create_scope_event_rejects_moment_without_unity(
    client_session_master: tuple[TestClient, Session, int, int],
) -> None:
    client, session, scope_id, _other_field_id = client_session_master

    row = session.scalars(select(Location).where(Location.scope_id == scope_id)).first()
    assert row is not None
    location_id = row.id
    item = session.scalars(select(Item).where(Item.scope_id == scope_id)).first()
    assert item is not None
    action = session.scalars(select(Action).where(Action.scope_id == scope_id)).first()
    assert action is not None

    response = client.post(
        f"/auth/tenant/current/scopes/{scope_id}/events",
        json={
            "location_id": location_id,
            "item_id": item.id,
            "action_id": action.id,
            "moment_utc": "2026-04-03T12:00:00",
        },
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    if isinstance(detail, dict):
        assert detail.get("code") == "event_standard_moment_forbidden"
    else:
        assert "standard" in detail.lower() or "moment" in detail.lower()


def test_create_scope_event_standard_without_unity(
    client_session_master: tuple[TestClient, Session, int, int],
) -> None:
    client, session, scope_id, _other_field_id = client_session_master

    location_id = session.scalars(select(Location).where(Location.scope_id == scope_id)).first().id
    item_id = session.scalars(select(Item).where(Item.scope_id == scope_id)).first().id
    action_id = session.scalars(select(Action).where(Action.scope_id == scope_id)).first().id

    before = session.scalars(select(Event)).all()
    before_ids = {e.id for e in before}

    response = client.post(
        f"/auth/tenant/current/scopes/{scope_id}/events",
        json={
            "location_id": location_id,
            "item_id": item_id,
            "action_id": action_id,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    new_row = next(
        (row for row in payload["item_list"] if row["id"] not in before_ids),
        None,
    )
    assert new_row is not None
    assert new_row["unity_id"] is None
    assert new_row["moment_utc"] is None
