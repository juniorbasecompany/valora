"""Endpoint `GET /scopes/{scope_id}/home/chart-series`: agregação por (field_id, age)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from valora_backend.auth.dependencies import get_current_member
from valora_backend.db import get_session
from valora_backend.main import create_app
from valora_backend.model.base import Base
from valora_backend.model.identity import (
    Account,
    Item,
    Kind,
    Location,
    Member,
    Scope,
    Tenant,
    Unity,
)
from valora_backend.model.rules import Action, Event, Field, Formula, Result


@pytest.fixture
def client_session_master() -> tuple[TestClient, Session, int, int, dict[str, int]]:
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

    # Dois campos: plantel (fact) e plantel_std (standard). Tipo numérico qualquer.
    plantel_field = Field(
        scope_id=scope.id,
        type="NUMERIC(15,4)",
        sort_order=0,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=False,
    )
    plantel_std_field = Field(
        scope_id=scope.id,
        type="NUMERIC(15,4)",
        sort_order=1,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=False,
    )
    session.add_all([plantel_field, plantel_std_field])
    session.flush()

    formula_a = Formula(action_id=action.id, sort_order=0, statement="${field:1}")
    formula_b = Formula(action_id=action.id, sort_order=1, statement="${field:1}")
    session.add_all([formula_a, formula_b])
    session.flush()

    unity = Unity(
        name="U1",
        location_id=location.id,
        item_id_list=[item.id],
        creation_utc=datetime(2026, 4, 1, 0, 0, 0),
    )
    session.add(unity)
    session.flush()

    event_fact = Event(
        unity_id=unity.id,
        location_id=location.id,
        item_id=item.id,
        action_id=action.id,
        age=0,
    )
    event_std = Event(
        unity_id=None,
        location_id=location.id,
        item_id=item.id,
        action_id=action.id,
        age=0,
    )
    session.add_all([event_fact, event_std])
    session.flush()

    # Resultados para o campo fact (plantel):
    #   age=1 -> dois resultados, formula_order 0 (100) e 2 (150). Esperado: 150.
    #   age=2 -> um resultado, formula_order 0 (200). Esperado: 200.
    session.add_all(
        [
            Result(
                unity_id=unity.id,
                age=1,
                event_id=event_fact.id,
                field_id=plantel_field.id,
                formula_id=formula_a.id,
                formula_order=0,
                numeric_value=Decimal("100"),
            ),
            Result(
                unity_id=unity.id,
                age=1,
                event_id=event_fact.id,
                field_id=plantel_field.id,
                formula_id=formula_b.id,
                formula_order=2,
                numeric_value=Decimal("150"),
            ),
            Result(
                unity_id=unity.id,
                age=2,
                event_id=event_fact.id,
                field_id=plantel_field.id,
                formula_id=formula_a.id,
                formula_order=0,
                numeric_value=Decimal("200"),
            ),
        ]
    )

    # Resultados para o campo std (plantel_std), vindo de evento padrão (Event.unity_id is None)
    # mas com Result.unity_id = unity.id (destinatária):
    #   age=1 -> 110
    #   age=2 -> 210
    session.add_all(
        [
            Result(
                unity_id=unity.id,
                age=1,
                event_id=event_std.id,
                field_id=plantel_std_field.id,
                formula_id=formula_a.id,
                formula_order=0,
                numeric_value=Decimal("110"),
            ),
            Result(
                unity_id=unity.id,
                age=2,
                event_id=event_std.id,
                field_id=plantel_std_field.id,
                formula_id=formula_a.id,
                formula_order=0,
                numeric_value=Decimal("210"),
            ),
        ]
    )
    session.commit()

    app = create_app()

    def override_get_session():
        yield session

    def override_get_current_member():
        return session.get(Member, member.id)

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_member] = override_get_current_member

    test_client = TestClient(app)
    field_id_map = {
        "plantel": plantel_field.id,
        "plantel_std": plantel_std_field.id,
    }
    try:
        yield test_client, session, scope.id, unity.id, field_id_map
    finally:
        test_client.close()
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def test_home_chart_series_returns_fact_and_standard_aggregated_by_age(
    client_session_master: tuple[TestClient, Session, int, int, dict[str, int]],
) -> None:
    client, _session, scope_id, unity_id, field_id_map = client_session_master

    response = client.get(
        f"/auth/tenant/current/scopes/{scope_id}/home/chart-series",
        params=[
            ("unity_id", unity_id),
            ("field_id_list", field_id_map["plantel"]),
            ("field_id_list", field_id_map["plantel_std"]),
        ],
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    series_list = payload["series_list"]
    assert len(series_list) == 2

    series_by_field_id = {row["field_id"]: row for row in series_list}

    plantel_points = series_by_field_id[field_id_map["plantel"]]["point_list"]
    assert [(p["age"], float(p["numeric_value"])) for p in plantel_points] == [
        (1, 150.0),  # formula_order máximo vence sobre 100
        (2, 200.0),
    ]

    plantel_std_points = series_by_field_id[field_id_map["plantel_std"]]["point_list"]
    assert [(p["age"], float(p["numeric_value"])) for p in plantel_std_points] == [
        (1, 110.0),
        (2, 210.0),
    ]


def test_home_chart_series_rejects_field_from_other_scope(
    client_session_master: tuple[TestClient, Session, int, int, dict[str, int]],
) -> None:
    client, _session, scope_id, unity_id, _field_id_map = client_session_master

    response = client.get(
        f"/auth/tenant/current/scopes/{scope_id}/home/chart-series",
        params=[
            ("unity_id", unity_id),
            ("field_id_list", 9999),
        ],
    )
    assert response.status_code == 404


def test_home_chart_series_rejects_too_many_fields(
    client_session_master: tuple[TestClient, Session, int, int, dict[str, int]],
) -> None:
    client, _session, scope_id, unity_id, field_id_map = client_session_master

    response = client.get(
        f"/auth/tenant/current/scopes/{scope_id}/home/chart-series",
        params=[
            ("unity_id", unity_id),
            ("field_id_list", field_id_map["plantel"]),
            ("field_id_list", field_id_map["plantel_std"]),
            ("field_id_list", field_id_map["plantel"] + 100000),
            ("field_id_list", field_id_map["plantel_std"] + 100001),
            ("field_id_list", field_id_map["plantel"] + 200000),
        ],
    )
    assert response.status_code == 400
