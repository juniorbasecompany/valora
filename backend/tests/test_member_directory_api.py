from __future__ import annotations

import unicodedata
from collections.abc import Generator
from contextlib import contextmanager
from decimal import Decimal
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from valora_backend.api.rules import (
    ScopeCurrentAgeCalculationRequest,
    ScopeResultCreateRequest,
    ScopeResultPatchRequest,
    calculate_scope_current_age,
    create_scope_event_result,
    delete_scope_current_age,
    delete_scope_field,
    patch_scope_event_result,
    read_scope_current_age,
)
from valora_backend.auth.dependencies import (
    get_current_account,
    get_current_member,
    get_current_tenant,
)
from valora_backend.db import get_session
from valora_backend.main import create_app
from valora_backend.model.base import Base
from valora_backend.model.identity import (
    Account,
    Kind,
    Location,
    Member,
    Scope,
    Tenant,
    Item,
    Unity,
)
from valora_backend.model.log import Log
from valora_backend.model.rules import Action, Event, Field, Formula, Input, Result


def _create_kind_via_api(client, scope_id: int, *, name: str) -> int:
    response = client.post(
        f"/auth/tenant/current/scopes/{scope_id}/kind",
        json={"name": name},
    )
    assert response.status_code == 200, response.text
    for row in response.json()["item_list"]:
        if row["name"] == name:
            return row["id"]
    raise AssertionError("kind not created")


def _item_by_kind_name(
    session: Session, scope_id: int, kind_name: str
) -> Item | None:
    return session.scalar(
        select(Item)
        .join(Kind, Item.kind_id == Kind.id)
        .where(Item.scope_id == scope_id, Kind.name == kind_name)
    )


@contextmanager
def build_test_client(
    *, current_member_key: str, with_scopes: bool = True
) -> Generator[tuple[TestClient, Session, dict[str, int]], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        def _sqlite_unaccent(value: str | None) -> str:
            if value is None:
                return ""
            normalized = unicodedata.normalize("NFKD", str(value))
            return "".join(
                character
                for character in normalized
                if not unicodedata.combining(character)
            )

        dbapi_connection.create_function("unaccent", 1, _sqlite_unaccent)
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
    tenant = Tenant(name="Acme Agro Ltda.")
    session.add(tenant)
    session.flush()

    master_account = Account(
        name="Master User",
        email="master@example.com",
        provider="google",
        provider_subject="google-master",
    )
    admin_account = Account(
        name="Admin User",
        email="admin@example.com",
        provider="google",
        provider_subject="google-admin",
    )
    member_account = Account(
        name="Member User",
        email="member@example.com",
        provider="google",
        provider_subject="google-member",
    )
    session.add_all([master_account, admin_account, member_account])
    session.flush()

    master_member = Member(
        name="Master User",
        email=master_account.email,
        tenant_id=tenant.id,
        account_id=master_account.id,
        role=1,
        status=1,
    )
    admin_member = Member(
        name="Admin User",
        email=admin_account.email,
        tenant_id=tenant.id,
        account_id=admin_account.id,
        role=2,
        status=1,
    )
    active_member = Member(
        name="Member User",
        email=member_account.email,
        tenant_id=tenant.id,
        account_id=member_account.id,
        role=3,
        status=1,
    )
    pending_member = Member(
        name="Pending Invite",
        email="pending@example.com",
        tenant_id=tenant.id,
        account_id=None,
        role=3,
        status=2,
    )
    session.add_all([master_member, admin_member, active_member, pending_member])
    if with_scopes:
        layer_scope = Scope(
            name="Aves",
            tenant_id=tenant.id,
        )
        grain_scope = Scope(
            name="Soja",
            tenant_id=tenant.id,
        )
        session.add_all([layer_scope, grain_scope])
    session.commit()

    member_id_by_key = {
        "master": master_member.id,
        "admin": admin_member.id,
        "member": active_member.id,
        "pending": pending_member.id,
    }
    account_id_by_key = {
        "master": master_account.id,
        "admin": admin_account.id,
        "member": member_account.id,
        "pending": None,
    }

    app = create_app()

    def override_get_session():
        yield session

    def override_get_current_member():
        return session.get(Member, member_id_by_key[current_member_key])

    def override_get_current_tenant():
        return session.get(Tenant, tenant.id)

    def override_get_current_account():
        account_id = account_id_by_key[current_member_key]
        if account_id is None:
            return None
        return session.get(Account, account_id)

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_account] = override_get_current_account
    app.dependency_overrides[get_current_member] = override_get_current_member
    app.dependency_overrides[get_current_tenant] = override_get_current_tenant

    client = TestClient(app)
    try:
        yield client, session, member_id_by_key
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def _seed_log(
    session: Session,
    *,
    tenant_id: int,
    account_id: int | None,
    table_name: str,
    action_type: str,
    row_id: int,
    row_payload: dict[str, object] | None,
    moment_utc: datetime,
) -> None:
    session.add(
        Log(
            tenant_id=tenant_id,
            account_id=account_id,
            table_name=table_name,
            action_type=action_type,
            row_id=row_id,
            row_payload=row_payload,
            moment_utc=moment_utc,
        )
    )


@contextmanager
def build_rules_session() -> Generator[tuple[Session, int], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys_only(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    testing_session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            Tenant.__table__,
            Scope.__table__,
            Location.__table__,
            Kind.__table__,
            Item.__table__,
            Unity.__table__,
            Field.__table__,
            Action.__table__,
            Formula.__table__,
            Event.__table__,
            Input.__table__,
            Result.__table__,
        ],
    )

    session = testing_session_local()
    tenant = Tenant(name="Acme Agro Ltda.")
    session.add(tenant)
    session.commit()

    try:
        yield session, tenant.id
    finally:
        session.close()
        engine.dispose()


def test_get_current_tenant_member_directory_exposes_capabilities() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.get("/auth/tenant/current/members")

    assert response.status_code == 200
    payload = response.json()
    member_map = {item["id"]: item for item in payload["item_list"]}

    assert payload["can_edit"] is True
    assert payload["can_create"] is True
    assert member_map[member_id_by_key["master"]]["can_edit_access"] is False
    assert member_map[member_id_by_key["master"]]["can_delete"] is False
    assert member_map[member_id_by_key["admin"]]["can_edit"] is True
    assert member_map[member_id_by_key["admin"]]["can_edit_access"] is True
    assert member_map[member_id_by_key["admin"]]["can_delete"] is True
    assert member_map[member_id_by_key["pending"]]["status"] == "PENDING"


def test_get_current_tenant_member_directory_member_role_cannot_create() -> None:
    with build_test_client(current_member_key="member") as (client, _, _):
        response = client.get("/auth/tenant/current/members")

    assert response.status_code == 200
    payload = response.json()
    assert payload["can_edit"] is False
    assert payload["can_create"] is False


def test_member_directory_q_filter_ignores_case_and_accent() -> None:
    with build_test_client(current_member_key="master") as (client, session, _):
        create_response = client.post(
            "/auth/tenant/current/members",
            json={
                "email": "uniao.member@example.com",
                "name": "União Cadastro",
            },
        )
        assert create_response.status_code == 200
        session.expire_all()
        created = session.scalar(
            select(Member).where(Member.email == "uniao.member@example.com")
        )
        assert created is not None

        response_plain = client.get("/auth/tenant/current/members", params={"q": "uniao"})
        response_accent = client.get("/auth/tenant/current/members", params={"q": "União"})
        response_case = client.get("/auth/tenant/current/members", params={"q": "uNIAO"})

    assert response_plain.status_code == 200
    assert response_accent.status_code == 200
    assert response_case.status_code == 200

    id_set_plain = {item["id"] for item in response_plain.json()["item_list"]}
    id_set_accent = {item["id"] for item in response_accent.json()["item_list"]}
    id_set_case = {item["id"] for item in response_case.json()["item_list"]}

    assert created.id in id_set_plain
    assert id_set_plain == id_set_accent == id_set_case


def test_master_can_invite_member_by_email() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.post(
            "/auth/tenant/current/members",
            json={
                "email": "novo.convite@example.com",
                "name": "Novo Convidado",
            },
        )
        session.expire_all()
        created = session.scalar(
            select(Member).where(Member.email == "novo.convite@example.com")
        )

    assert response.status_code == 200
    payload = response.json()
    assert created is not None
    assert created.status == 2
    assert created.account_id is None
    assert any(
        item["email"] == "novo.convite@example.com" for item in payload["item_list"]
    )


def test_master_can_invite_member_with_empty_name_fields() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        session,
        _member_id_by_key,
    ):
        response = client.post(
            "/auth/tenant/current/members",
            json={
                "email": "convite.sem.nome@example.com",
                "name": "",
            },
        )
        session.expire_all()
        created = session.scalar(
            select(Member).where(Member.email == "convite.sem.nome@example.com")
        )

    assert response.status_code == 200
    assert created is not None
    assert created.name is None


def test_invite_member_rejects_duplicate_email() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.post(
            "/auth/tenant/current/members",
            json={
                "email": "pending@example.com",
                "name": "Dup",
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "A member with this email already exists for this tenant"
    )


def test_member_cannot_invite() -> None:
    with build_test_client(current_member_key="member") as (client, _, _):
        response = client.post(
            "/auth/tenant/current/members",
            json={
                "email": "x@example.com",
                "name": "X",
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions to invite members"


def test_master_can_send_member_invite_email() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        with patch(
            "valora_backend.api.auth.send_member_invite",
            return_value=(True, ""),
        ):
            response = client.post(
                f"/auth/tenant/current/members/{member_id_by_key['pending']}/invite",
                headers={"X-Valora-Invite-Email-Locale": "en-US"},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "pending@example.com"
    assert "successfully" in payload["message"].lower()


def test_send_member_invite_email_rejects_active_linked_member() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.post(
            f"/auth/tenant/current/members/{member_id_by_key['member']}/invite",
        )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "member_invite_already_linked"


def test_member_cannot_send_invite_email() -> None:
    with build_test_client(current_member_key="member") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.post(
            f"/auth/tenant/current/members/{member_id_by_key['pending']}/invite",
        )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "member_invite_forbidden"


def test_send_member_invite_email_not_found() -> None:
    with build_test_client(current_member_key="master") as (client, _, _):
        response = client.post("/auth/tenant/current/members/999999/invite")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "member_invite_not_found"


def test_send_member_invite_email_propagates_delivery_failure() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        with patch(
            "valora_backend.api.auth.send_member_invite",
            return_value=(False, "smtp down"),
        ):
            response = client.post(
                f"/auth/tenant/current/members/{member_id_by_key['pending']}/invite",
            )

    assert response.status_code == 502
    body = response.json()["detail"]
    assert body["code"] == "member_invite_delivery_failed"
    assert body["message"] == "smtp down"


def test_admin_can_update_member_profile_without_changing_access() -> None:
    with build_test_client(current_member_key="admin") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "email": "member@example.com",
                "name": "Updated Member",
                "role": 3,
                "status": 1,
            },
        )
        session.expire_all()
        updated_member = session.get(Member, member_id_by_key["member"])

    assert response.status_code == 200
    assert updated_member is not None
    assert updated_member.name == "Updated Member"
    assert updated_member.role == 3
    assert updated_member.status == 1


def test_admin_can_clear_member_name() -> None:
    with build_test_client(current_member_key="admin") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "email": "member@example.com",
                "name": "",
                "role": 3,
                "status": 1,
            },
        )
        session.expire_all()
        updated_member = session.get(Member, member_id_by_key["member"])

    assert response.status_code == 200
    assert updated_member is not None
    assert updated_member.name is None


def test_admin_can_change_member_email() -> None:
    with build_test_client(current_member_key="admin") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "email": "member.renamed@example.com",
                "name": "Member User",
                "role": 3,
                "status": 1,
            },
        )
        session.expire_all()
        updated_member = session.get(Member, member_id_by_key["member"])

    assert response.status_code == 200
    assert updated_member is not None
    assert updated_member.email == "member.renamed@example.com"


def test_patch_member_rejects_duplicate_email() -> None:
    with build_test_client(current_member_key="admin") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "email": "admin@example.com",
                "name": "Member User",
                "role": 3,
                "status": 1,
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "A member with this email already exists for this tenant"
    )


def test_admin_cannot_change_member_access() -> None:
    with build_test_client(current_member_key="admin") as (client, _, member_id_by_key):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "email": "member@example.com",
                "name": "Member Updated",
                "role": 2,
                "status": 1,
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Only master members can change role or status for this record"
    )


def test_master_cannot_activate_member_without_linked_account() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['pending']}",
            json={
                "email": "pending@example.com",
                "name": "Pending Invite",
                "role": 3,
                "status": 1,
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Pending members without a linked account cannot become active"
    )


def test_master_can_delete_another_member() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.delete(
            f"/auth/tenant/current/members/{member_id_by_key['member']}"
        )
        session.expire_all()
        deleted_member = session.get(Member, member_id_by_key["member"])

    assert response.status_code == 200
    assert deleted_member is None
    payload = response.json()
    assert all(
        item["id"] != member_id_by_key["member"] for item in payload["item_list"]
    )


def test_master_cannot_delete_self_member_record() -> None:
    with build_test_client(current_member_key="master") as (
        client,
        _,
        member_id_by_key,
    ):
        response = client.delete(
            f"/auth/tenant/current/members/{member_id_by_key['master']}"
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only master members can delete another member"


def test_master_can_delete_current_tenant_tree() -> None:
    with build_test_client(current_member_key="master", with_scopes=False) as (
        client,
        session,
        _,
    ):
        tenant_id = session.scalar(select(Tenant.id))
        response = client.delete("/auth/tenant/current")
        session.expire_all()
        remaining_tenant = session.get(Tenant, tenant_id)
        remaining_member_count = session.query(Member).count()

    assert response.status_code == 200
    assert response.json() == {"deleted_tenant_id": tenant_id}
    assert remaining_tenant is None
    assert remaining_member_count == 0


def test_admin_can_list_create_update_and_delete_scope_directory() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        directory_response = client.get("/auth/tenant/current/scopes")
        create_response = client.post(
            "/auth/tenant/current/scopes",
            json={
                "name": "Leite",
            },
        )
        session.expire_all()
        created_scope = session.scalar(select(Scope).where(Scope.name == "Leite"))
        assert created_scope is not None
        update_response = client.patch(
            f"/auth/tenant/current/scopes/{created_scope.id}",
            json={
                "name": "Leite e derivados",
            },
        )
        delete_response = client.delete(
            f"/auth/tenant/current/scopes/{created_scope.id}"
        )
        session.expire_all()
        deleted_scope = session.get(Scope, created_scope.id)

    assert directory_response.status_code == 200
    directory_payload = directory_response.json()
    assert directory_payload["can_edit"] is True
    assert directory_payload["can_create"] is True
    assert len(directory_payload["item_list"]) == 2

    assert create_response.status_code == 200
    create_payload = create_response.json()
    assert any(item["name"] == "Leite" for item in create_payload["item_list"])

    assert update_response.status_code == 200
    update_payload = update_response.json()
    assert any(
        item["name"] == "Leite e derivados"
        for item in update_payload["item_list"]
    )

    assert delete_response.status_code == 200
    assert deleted_scope is None


def test_scope_directory_q_filter_ignores_case_and_accent() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        create_response = client.post(
            "/auth/tenant/current/scopes",
            json={
                "name": "União",
            },
        )
        assert create_response.status_code == 200
        session.expire_all()
        created = session.scalar(select(Scope).where(Scope.name == "União"))
        assert created is not None

        response_plain = client.get("/auth/tenant/current/scopes", params={"q": "uniao"})
        response_accent = client.get("/auth/tenant/current/scopes", params={"q": "União"})
        response_case = client.get("/auth/tenant/current/scopes", params={"q": "uNIAO"})

    assert response_plain.status_code == 200
    assert response_accent.status_code == 200
    assert response_case.status_code == 200

    id_set_plain = {item["id"] for item in response_plain.json()["item_list"]}
    id_set_accent = {item["id"] for item in response_accent.json()["item_list"]}
    id_set_case = {item["id"] for item in response_case.json()["item_list"]}

    assert created.id in id_set_plain
    assert id_set_plain == id_set_accent == id_set_case


def test_member_cannot_create_scope() -> None:
    with build_test_client(current_member_key="member") as (client, _, _):
        response = client.post(
            "/auth/tenant/current/scopes",
            json={
                "name": "Cafe",
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions to create scope"


def test_admin_can_create_move_update_and_delete_locations() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        list_response = client.get(f"/auth/tenant/current/scopes/{scope_id}/locations")
        root_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Fazenda Norte",
                "parent_location_id": None,
            },
        )
        session.expire_all()
        root_location = session.scalar(
            select(Location).where(Location.name == "Fazenda Norte")
        )
        assert root_location is not None

        child_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Aviário B",
                "parent_location_id": root_location.id,
            },
        )
        session.expire_all()
        child_location = session.scalar(
            select(Location).where(Location.name == "Aviário B")
        )
        assert child_location is not None

        move_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{child_location.id}/move",
            json={
                "parent_location_id": None,
                "target_index": 0,
            },
        )
        update_response = client.patch(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{child_location.id}",
            json={
                "name": "Aviário de postura reformado",
                "parent_location_id": None,
            },
        )
        delete_response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{root_location.id}"
        )
        session.expire_all()
        deleted_root = session.get(Location, root_location.id)
        updated_child = session.get(Location, child_location.id)

    assert list_response.status_code == 200
    assert list_response.json()["can_create"] is True
    assert list_response.json()["item_list"] == []

    assert root_response.status_code == 200
    root_payload = root_response.json()
    assert any(item["name"] == "Fazenda Norte" for item in root_payload["item_list"])

    assert child_response.status_code == 200
    child_payload = child_response.json()
    created_child = next(
        item for item in child_payload["item_list"] if item["name"] == "Aviário B"
    )
    assert created_child["parent_location_id"] == root_location.id
    assert created_child["path_labels"] == ["Fazenda Norte", "Aviário B"]

    assert move_response.status_code == 200
    moved_child = next(
        item
        for item in move_response.json()["item_list"]
        if item["id"] == child_location.id
    )
    assert moved_child["parent_location_id"] is None
    assert moved_child["sort_order"] == 0

    assert update_response.status_code == 200
    assert updated_child is not None
    assert updated_child.name == "Aviário de postura reformado"

    assert delete_response.status_code == 200
    assert deleted_root is None


def test_location_directory_q_filter_matches_accent_and_partial_text() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        create_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "União",
                "parent_location_id": None,
            },
        )
        assert create_response.status_code == 200

        response_with_accent = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            params={"q": "União"},
        )
        response_without_accent = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            params={"q": "Uniao"},
        )
        response_partial = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            params={"q": "nia"},
        )
        response_case = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            params={"q": "uNIAO"},
        )

    assert response_with_accent.status_code == 200
    assert response_without_accent.status_code == 200
    assert response_partial.status_code == 200
    assert response_case.status_code == 200

    name_list_with_accent = [item["name"] for item in response_with_accent.json()["item_list"]]
    name_list_without_accent = [
        item["name"] for item in response_without_accent.json()["item_list"]
    ]
    name_list_partial = [item["name"] for item in response_partial.json()["item_list"]]
    name_list_case = [item["name"] for item in response_case.json()["item_list"]]

    assert "União" in name_list_with_accent
    assert "União" in name_list_without_accent
    assert "União" in name_list_partial
    assert "União" in name_list_case


def test_location_directory_q_filter_keeps_ancestor_context_for_child_match() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        root_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "BR",
                "parent_location_id": None,
            },
        )
        assert root_response.status_code == 200
        session.expire_all()
        root_location = session.scalar(select(Location).where(Location.name == "BR"))
        assert root_location is not None

        child_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "União",
                "parent_location_id": root_location.id,
            },
        )
        assert child_response.status_code == 200

        response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            params={"q": "União"},
        )

    assert response.status_code == 200
    item_list = response.json()["item_list"]
    item_by_name = {item["name"]: item for item in item_list}
    assert "BR" in item_by_name
    assert "União" in item_by_name
    assert item_by_name["União"]["parent_location_id"] == item_by_name["BR"]["id"]
    assert item_by_name["União"]["path_labels"] == ["BR", "União"]


def test_location_delete_cascades_to_descendant_list() -> None:
    """Alinhado ao ERD: FK location.parent_location_id com delete Cascade."""
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Granja Sul",
                "parent_location_id": None,
            },
        )
        session.expire_all()
        parent_location = session.scalar(
            select(Location).where(Location.name == "Granja Sul")
        )
        assert parent_location is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Núcleo 1",
                "parent_location_id": parent_location.id,
            },
        )
        session.expire_all()
        child_location = session.scalar(
            select(Location).where(Location.name == "Núcleo 1")
        )
        assert child_location is not None
        parent_location_id = parent_location.id
        child_location_id = child_location.id

        response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{parent_location_id}"
        )
        session.expire_all()
        deleted_parent = session.get(Location, parent_location_id)
        deleted_child = session.get(Location, child_location_id)

    assert response.status_code == 200
    assert deleted_parent is None
    assert deleted_child is None
    name_list = [item["name"] for item in response.json()["item_list"]]
    assert "Granja Sul" not in name_list
    assert "Núcleo 1" not in name_list


def test_location_move_cannot_create_cycle() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Unidade Oeste",
                "parent_location_id": None,
            },
        )
        session.expire_all()
        parent_location = session.scalar(
            select(Location).where(Location.name == "Unidade Oeste")
        )
        assert parent_location is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Setor A",
                "parent_location_id": parent_location.id,
            },
        )
        session.expire_all()
        child_location = session.scalar(
            select(Location).where(Location.name == "Setor A")
        )
        assert child_location is not None

        response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{parent_location.id}/move",
            json={
                "parent_location_id": child_location.id,
                "target_index": 0,
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Location cannot move under one of its descendants"
    )


def test_scope_delete_is_blocked_when_scope_has_locations() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Matriz",
                "parent_location_id": None,
            },
        )

        response = client.delete(f"/auth/tenant/current/scopes/{scope_id}")

    assert response.status_code == 400
    assert (
        response.json()["detail"] == "Cannot delete scope while it still has locations"
    )


def test_member_cannot_create_location() -> None:
    with build_test_client(current_member_key="member") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Base",
                "parent_location_id": None,
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions to create location"


def test_member_can_select_current_scope_and_auth_me_exposes_it() -> None:
    with build_test_client(current_member_key="member") as (
        client,
        session,
        member_id_by_key,
    ):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        patch_response = client.patch(
            "/auth/me/current-scope", json={"scope_id": scope_id}
        )
        session.expire_all()
        current_member = session.get(Member, member_id_by_key["member"])
        directory_response = client.get("/auth/tenant/current/scopes")
        session_response = client.get("/auth/me")

    assert patch_response.status_code == 200
    assert patch_response.json() == {"current_scope_id": scope_id}
    assert current_member is not None
    assert current_member.current_scope_id == scope_id
    assert directory_response.status_code == 200
    assert directory_response.json()["current_scope_id"] == scope_id
    assert session_response.status_code == 200
    assert session_response.json()["member"]["current_scope_id"] == scope_id


def test_member_cannot_select_scope_from_another_tenant() -> None:
    with build_test_client(current_member_key="member") as (client, session, _):
        other_tenant = Tenant(name="Other Tenant")
        session.add(other_tenant)
        session.flush()
        other_scope = Scope(
            name="Leite",
            tenant_id=other_tenant.id,
        )
        session.add(other_scope)
        session.commit()

        response = client.patch(
            "/auth/me/current-scope",
            json={"scope_id": other_scope.id},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Scope not found for current tenant"


def test_admin_can_create_move_update_and_delete_items() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_galinha_id = _create_kind_via_api(
            client,
            scope_id,
            name="Galinha",
        )
        kind_branca_id = _create_kind_via_api(
            client,
            scope_id,
            name="Branca",
        )

        list_response = client.get(f"/auth/tenant/current/scopes/{scope_id}/items")
        root_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_galinha_id,
                "parent_item_id": None,
            },
        )
        session.expire_all()
        root_item = _item_by_kind_name(session, scope_id, "Galinha")
        assert root_item is not None

        child_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_branca_id,
                "parent_item_id": root_item.id,
            },
        )
        session.expire_all()
        child_item = _item_by_kind_name(session, scope_id, "Branca")
        assert child_item is not None

        move_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items/{child_item.id}/move",
            json={
                "parent_item_id": None,
                "target_index": 0,
            },
        )
        update_response = client.patch(
            f"/auth/tenant/current/scopes/{scope_id}/kind/{kind_branca_id}",
            json={"name": "Linhagem branca leve"},
        )
        assert update_response.status_code == 200
        branca_kind = session.get(Kind, kind_branca_id)
        assert branca_kind is not None
        assert branca_kind.name == "Linhagem branca leve"

        delete_response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/items/{root_item.id}"
        )
        session.expire_all()
        deleted_root = session.get(Item, root_item.id)
        root_item_id = root_item.id
        child_item_id = child_item.id

    assert list_response.status_code == 200
    assert list_response.json()["can_create"] is True
    assert list_response.json()["item_list"] == []

    assert root_response.status_code == 200
    root_payload = root_response.json()
    assert any(item["name"] == "Galinha" for item in root_payload["item_list"])

    assert child_response.status_code == 200
    child_payload = child_response.json()
    created_child = next(
        item for item in child_payload["item_list"] if item["name"] == "Branca"
    )
    assert created_child["parent_item_id"] == root_item_id
    assert created_child["path_labels"] == ["Galinha", "Branca"]

    assert move_response.status_code == 200
    moved_child = next(
        item
        for item in move_response.json()["item_list"]
        if item["id"] == child_item_id
    )
    assert moved_child["parent_item_id"] is None
    assert moved_child["sort_order"] == 0

    assert delete_response.status_code == 200
    assert deleted_root is None


def test_item_directory_q_filter_matches_accent_and_partial_text() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_uniao_id = _create_kind_via_api(
            client,
            scope_id,
            name="União",
        )
        create_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_uniao_id,
                "parent_item_id": None,
            },
        )
        assert create_response.status_code == 200

        response_with_accent = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            params={"q": "União"},
        )
        response_without_accent = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            params={"q": "Uniao"},
        )
        response_partial = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            params={"q": "nia"},
        )
        response_case = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            params={"q": "uNIAO"},
        )

    assert response_with_accent.status_code == 200
    assert response_without_accent.status_code == 200
    assert response_partial.status_code == 200
    assert response_case.status_code == 200

    name_list_with_accent = [item["name"] for item in response_with_accent.json()["item_list"]]
    name_list_without_accent = [
        item["name"] for item in response_without_accent.json()["item_list"]
    ]
    name_list_partial = [item["name"] for item in response_partial.json()["item_list"]]
    name_list_case = [item["name"] for item in response_case.json()["item_list"]]

    assert "União" in name_list_with_accent
    assert "União" in name_list_without_accent
    assert "União" in name_list_partial
    assert "União" in name_list_case


def test_item_directory_q_filter_keeps_ancestor_context_for_child_match() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_br_id = _create_kind_via_api(
            client,
            scope_id,
            name="BR",
        )
        root_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_br_id,
                "parent_item_id": None,
            },
        )
        assert root_response.status_code == 200
        session.expire_all()
        root_item = _item_by_kind_name(session, scope_id, "BR")
        assert root_item is not None

        kind_uniao_id = _create_kind_via_api(
            client,
            scope_id,
            name="União",
        )
        child_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_uniao_id,
                "parent_item_id": root_item.id,
            },
        )
        assert child_response.status_code == 200

        response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            params={"q": "União"},
        )

    assert response.status_code == 200
    item_list = response.json()["item_list"]
    item_by_name = {item["name"]: item for item in item_list}
    assert "BR" in item_by_name
    assert "União" in item_by_name
    assert item_by_name["União"]["parent_item_id"] == item_by_name["BR"]["id"]
    assert item_by_name["União"]["path_labels"] == ["BR", "União"]


def test_item_delete_cascades_to_descendant_list() -> None:
    """Alinhado ao ERD: FK item.parent_item_id com delete Cascade."""
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_matriz_id = _create_kind_via_api(
            client, scope_id, name="Matriz"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_matriz_id,
                "parent_item_id": None,
            },
        )
        session.expire_all()
        parent_item = _item_by_kind_name(session, scope_id, "Matriz")
        assert parent_item is not None

        kind_filial_id = _create_kind_via_api(
            client, scope_id, name="Filial"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_filial_id,
                "parent_item_id": parent_item.id,
            },
        )
        session.expire_all()
        child_item = _item_by_kind_name(session, scope_id, "Filial")
        assert child_item is not None
        parent_item_id = parent_item.id
        child_item_id = child_item.id

        response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/items/{parent_item_id}"
        )
        session.expire_all()
        deleted_parent = session.get(Item, parent_item_id)
        deleted_child = session.get(Item, child_item_id)

    assert response.status_code == 200
    assert deleted_parent is None
    assert deleted_child is None


def test_item_move_cannot_create_cycle() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_a_id = _create_kind_via_api(
            client, scope_id, name="Nivel A"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_a_id,
                "parent_item_id": None,
            },
        )
        session.expire_all()
        parent_item = _item_by_kind_name(session, scope_id, "Nivel A")
        assert parent_item is not None

        kind_b_id = _create_kind_via_api(
            client, scope_id, name="Nivel B"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_b_id,
                "parent_item_id": parent_item.id,
            },
        )
        session.expire_all()
        child_item = _item_by_kind_name(session, scope_id, "Nivel B")
        assert child_item is not None

        response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items/{parent_item.id}/move",
            json={
                "parent_item_id": child_item.id,
                "target_index": 0,
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Item cannot move under one of its descendants"
    )


def test_scope_delete_is_blocked_when_scope_has_items() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_tipo_a_id = _create_kind_via_api(
            client, scope_id, name="Tipo A"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_tipo_a_id,
                "parent_item_id": None,
            },
        )

        response = client.delete(f"/auth/tenant/current/scopes/{scope_id}")

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Cannot delete scope while it still has items"
    )


def test_member_cannot_create_item() -> None:
    with build_test_client(current_member_key="member") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_x = Kind(scope_id=scope_id, name="X")
        session.add(kind_x)
        session.commit()

        response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={
                "kind_id": kind_x.id,
                "parent_item_id": None,
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions to create item"


def test_kind_list_includes_reference_count() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_id = _create_kind_via_api(
            client, scope_id, name="RefCnt"
        )
        list_before = client.get(f"/auth/tenant/current/scopes/{scope_id}/kind")
        assert list_before.status_code == 200
        row_before = next(r for r in list_before.json()["item_list"] if r["id"] == kind_id)
        assert row_before["reference_count"] == 0

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={"kind_id": kind_id, "parent_item_id": None},
        )
        list_after = client.get(f"/auth/tenant/current/scopes/{scope_id}/kind")
        row_after = next(r for r in list_after.json()["item_list"] if r["id"] == kind_id)
        assert row_after["reference_count"] == 1


def test_delete_kind_blocked_when_referenced_by_item() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_id = _create_kind_via_api(
            client, scope_id, name="InUse"
        )
        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/items",
            json={"kind_id": kind_id, "parent_item_id": None},
        )
        response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/kind/{kind_id}"
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Cannot delete kind while items still reference it"
    )


def test_delete_kind_succeeds_when_unused() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        kind_id = _create_kind_via_api(
            client, scope_id, name="Orphan"
        )
        response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/kind/{kind_id}"
        )
        session.expire_all()
        orphan = session.get(Kind, kind_id)

    assert response.status_code == 200
    assert orphan is None
    id_list = [r["id"] for r in response.json()["item_list"]]
    assert kind_id not in id_list


def test_delete_scope_field_blocked_when_referenced_by_formula() -> None:
    session = MagicMock()
    session.scalar.return_value = 123
    member = SimpleNamespace(role=2, tenant_id=1)

    with (
        patch("valora_backend.api.rules._require_scope_rules_editor"),
        patch("valora_backend.api.rules._get_tenant_scope"),
        patch(
            "valora_backend.api.rules._field_in_scope_or_404",
            return_value=SimpleNamespace(id=7),
        ),
    ):
        with pytest.raises(HTTPException) as excinfo:
            delete_scope_field(scope_id=5, field_id=7, member=member, session=session)

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == (
        "Cannot delete field while formulas reference it"
    )
    assert session.scalar.call_count == 1
    session.delete.assert_not_called()


def test_scope_field_and_action_q_filter_ignores_case_and_accent() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        field_create_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            json={
                "sql_type": "VARCHAR",
                "label_lang": "pt-BR",
                "label_name": "Campo União",
            },
        )
        assert field_create_response.status_code == 200

        action_create_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/actions",
            json={
                "label_lang": "pt-BR",
                "label_name": "Ação União",
            },
        )
        assert action_create_response.status_code == 200

        field_plain_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR", "q": "uniao"},
        )
        field_accent_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR", "q": "União"},
        )
        field_case_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR", "q": "uNIAO"},
        )

        action_plain_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/actions",
            params={"label_lang": "pt-BR", "q": "uniao"},
        )
        action_accent_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/actions",
            params={"label_lang": "pt-BR", "q": "União"},
        )
        action_case_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/actions",
            params={"label_lang": "pt-BR", "q": "uNIAO"},
        )

    assert field_plain_response.status_code == 200
    assert field_accent_response.status_code == 200
    assert field_case_response.status_code == 200
    assert action_plain_response.status_code == 200
    assert action_accent_response.status_code == 200
    assert action_case_response.status_code == 200

    field_name_set_plain = {
        item["label_name"] for item in field_plain_response.json()["item_list"] if item["label_name"]
    }
    field_name_set_accent = {
        item["label_name"] for item in field_accent_response.json()["item_list"] if item["label_name"]
    }
    field_name_set_case = {
        item["label_name"] for item in field_case_response.json()["item_list"] if item["label_name"]
    }
    assert "Campo União" in field_name_set_plain
    assert field_name_set_plain == field_name_set_accent == field_name_set_case

    action_name_set_plain = {
        item["label_name"] for item in action_plain_response.json()["item_list"] if item["label_name"]
    }
    action_name_set_accent = {
        item["label_name"] for item in action_accent_response.json()["item_list"] if item["label_name"]
    }
    action_name_set_case = {
        item["label_name"] for item in action_case_response.json()["item_list"] if item["label_name"]
    }
    assert "Ação União" in action_name_set_plain
    assert action_name_set_plain == action_name_set_accent == action_name_set_case


def test_scope_field_reorder_and_reject_invalid_list() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        field_id_list: list[int] = []
        for name in ("OrdA", "OrdB", "OrdC"):
            resp = client.post(
                f"/auth/tenant/current/scopes/{scope_id}/fields",
                json={
                    "sql_type": "INTEGER",
                    "label_lang": "pt-BR",
                    "label_name": name,
                },
            )
            assert resp.status_code == 200
            for item in resp.json()["item_list"]:
                if item.get("label_name") == name:
                    field_id_list.append(item["id"])
                    break

        assert len(field_id_list) == 3
        assert sorted(field_id_list) == field_id_list

        bad = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields/reorder",
            json={"field_id_list": field_id_list[:2]},
        )
        assert bad.status_code == 400

        reversed_ids = list(reversed(field_id_list))
        ok = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields/reorder",
            params={"label_lang": "pt-BR"},
            json={"field_id_list": reversed_ids},
        )
        assert ok.status_code == 200
        items = ok.json()["item_list"]
        assert [item["id"] for item in items] == reversed_ids
        assert [item["sort_order"] for item in items] == [0, 1, 2]


def test_scope_field_age_flags_are_exposed_and_unique_per_scope() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        create_initial = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR"},
            json={
                "sql_type": "INTEGER",
                "label_lang": "pt-BR",
                "label_name": "Idade inicial",
                "is_initial_age": True,
            },
        )
        assert create_initial.status_code == 200
        created_initial = next(
            item
            for item in create_initial.json()["item_list"]
            if item.get("label_name") == "Idade inicial"
        )
        assert created_initial["is_initial_age"] is True
        assert created_initial["is_final_age"] is False
        assert created_initial["is_current_age"] is False

        create_final = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR"},
            json={
                "sql_type": "INTEGER",
                "label_lang": "pt-BR",
                "label_name": "Idade final",
                "is_final_age": True,
            },
        )
        assert create_final.status_code == 200
        created_final = next(
            item
            for item in create_final.json()["item_list"]
            if item.get("label_name") == "Idade final"
        )
        assert created_final["is_current_age"] is False

        create_current = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            params={"label_lang": "pt-BR"},
            json={
                "sql_type": "INTEGER",
                "label_lang": "pt-BR",
                "label_name": "Idade atual",
                "is_current_age": True,
            },
        )
        assert create_current.status_code == 200
        created_current = next(
            item
            for item in create_current.json()["item_list"]
            if item.get("label_name") == "Idade atual"
        )
        assert created_current["is_initial_age"] is False
        assert created_current["is_final_age"] is False
        assert created_current["is_current_age"] is True

        duplicate_initial = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            json={
                "sql_type": "INTEGER",
                "label_lang": "pt-BR",
                "label_name": "Outra idade inicial",
                "is_initial_age": True,
            },
        )
        assert duplicate_initial.status_code == 400
        assert "initial age" in duplicate_initial.json()["detail"].lower()

        duplicate_current = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/fields",
            json={
                "sql_type": "INTEGER",
                "label_lang": "pt-BR",
                "label_name": "Outra idade atual",
                "is_current_age": True,
            },
        )
        assert duplicate_current.status_code == 400
        assert "current age" in duplicate_current.json()["detail"].lower()

        invalid_both = client.patch(
            f"/auth/tenant/current/scopes/{scope_id}/fields/{created_initial['id']}",
            json={
                "is_initial_age": True,
                "is_final_age": True,
            },
        )
        assert invalid_both.status_code == 422


def test_scope_action_reorder_and_reject_invalid_list() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        action_id_list: list[int] = []
        for name in ("ActA", "ActB", "ActC"):
            resp = client.post(
                f"/auth/tenant/current/scopes/{scope_id}/actions",
                json={
                    "label_lang": "pt-BR",
                    "label_name": name,
                },
            )
            assert resp.status_code == 200
            for item in resp.json()["item_list"]:
                if item.get("label_name") == name:
                    action_id_list.append(item["id"])
                    break

        assert len(action_id_list) == 3

        bad = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/actions/reorder",
            json={"action_id_list": action_id_list[:2]},
        )
        assert bad.status_code == 400

        reversed_ids = list(reversed(action_id_list))
        ok = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/actions/reorder",
            params={"label_lang": "pt-BR"},
            json={"action_id_list": reversed_ids},
        )
        assert ok.status_code == 200
        items = ok.json()["item_list"]
        assert [item["id"] for item in items] == reversed_ids
        assert [item["sort_order"] for item in items] == [0, 1, 2]


def test_scope_action_is_recurrent_is_exposed_and_editable() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        create_response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/actions",
            json={
                "label_lang": "pt-BR",
                "label_name": "Mortalidade recorrente",
                "is_recurrent": True,
            },
        )
        assert create_response.status_code == 200

        created = next(
            item
            for item in create_response.json()["item_list"]
            if item.get("label_name") == "Mortalidade recorrente"
        )
        assert created["is_recurrent"] is True

        get_response = client.get(
            f"/auth/tenant/current/scopes/{scope_id}/actions/{created['id']}"
        )
        assert get_response.status_code == 200
        assert get_response.json()["is_recurrent"] is True

        patch_response = client.patch(
            f"/auth/tenant/current/scopes/{scope_id}/actions/{created['id']}",
            json={"is_recurrent": False},
        )
        assert patch_response.status_code == 200

        patched = next(
            item
            for item in patch_response.json()["item_list"]
            if item["id"] == created["id"]
        )
        assert patched["is_recurrent"] is False


def test_tenant_history_endpoint_returns_latest_scope_logs_with_diff() -> None:
    tenant_id_value: int | None = None
    with build_test_client(current_member_key="admin") as (client, session, _):
        tenant = session.scalar(select(Tenant))
        admin_account = session.scalar(
            select(Account).where(Account.email == "admin@example.com")
        )
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))

        assert tenant is not None
        assert admin_account is not None
        assert scope_id is not None
        tenant_id_value = tenant.id

        base_time = datetime(2026, 3, 25, 10, 0, 0)
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="I",
            row_id=scope_id,
            row_payload={
                "id": scope_id,
                "name": "Aves para producao de ovos",
                "tenant_id": tenant.id,
            },
            moment_utc=base_time,
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="U",
            row_id=scope_id,
            row_payload={
                "id": scope_id,
                "name": "Aves postura",
                "tenant_id": tenant.id,
            },
            moment_utc=base_time.replace(minute=5),
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="U",
            row_id=scope_id,
            row_payload={
                "id": scope_id,
                "name": "Aves especiais",
                "tenant_id": tenant.id,
            },
            moment_utc=base_time.replace(minute=10),
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="D",
            row_id=scope_id,
            row_payload=None,
            moment_utc=base_time.replace(minute=15),
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="member",
            action_type="U",
            row_id=999,
            row_payload={"id": 999},
            moment_utc=base_time.replace(minute=20),
        )
        session.commit()

        response = client.get("/auth/tenant/current/logs/scope")

    assert response.status_code == 200
    payload = response.json()

    assert [item["action_type"] for item in payload["item_list"]] == [
        "D",
        "U",
        "U",
        "I",
    ]
    assert payload["has_more"] is False
    assert payload["next_offset"] is None

    delete_item = payload["item_list"][0]
    latest_update = payload["item_list"][1]
    previous_update = payload["item_list"][2]
    insert_item = payload["item_list"][3]

    assert tenant_id_value is not None
    assert delete_item["row"] == {
        "id": scope_id,
        "name": "Aves especiais",
        "tenant_id": tenant_id_value,
    }
    assert delete_item["diff_state"] == "not_applicable"
    assert delete_item["actor_name"] == "Admin User"

    assert latest_update["diff_state"] == "ready"
    assert latest_update["field_change_list"] == [
        {
            "field_name": "name",
            "previous_value": "Aves postura",
            "current_value": "Aves especiais",
        }
    ]

    assert previous_update["diff_state"] == "ready"
    assert previous_update["field_change_list"] == [
        {
            "field_name": "name",
            "previous_value": "Aves para producao de ovos",
            "current_value": "Aves postura",
        }
    ]

    assert insert_item["row"]["id"] == scope_id
    assert insert_item["diff_state"] == "not_applicable"


def test_tenant_history_endpoint_supports_actor_filter_and_pagination() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        tenant = session.scalar(select(Tenant))
        admin_account = session.scalar(
            select(Account).where(Account.email == "admin@example.com")
        )
        master_account = session.scalar(
            select(Account).where(Account.email == "master@example.com")
        )
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))

        assert tenant is not None
        assert admin_account is not None
        assert master_account is not None
        assert scope_id is not None

        base_time = datetime(2026, 3, 26, 9, 0, 0)
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="I",
            row_id=scope_id,
            row_payload={"id": scope_id, "name": "Aves"},
            moment_utc=base_time,
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=admin_account.id,
            table_name="scope",
            action_type="U",
            row_id=scope_id,
            row_payload={"id": scope_id, "name": "Aves"},
            moment_utc=base_time.replace(minute=10),
        )
        _seed_log(
            session,
            tenant_id=tenant.id,
            account_id=master_account.id,
            table_name="scope",
            action_type="U",
            row_id=scope_id,
            row_payload={"id": scope_id, "name": "Aves"},
            moment_utc=base_time.replace(minute=20),
        )
        session.commit()

        response = client.get(
            "/auth/tenant/current/logs/scope",
            params={"actor": "Admin", "limit": 1},
        )

    assert response.status_code == 200
    payload = response.json()

    assert len(payload["item_list"]) == 1
    assert payload["item_list"][0]["actor_name"] == "Admin User"
    assert payload["item_list"][0]["action_type"] == "U"
    assert payload["has_more"] is True
    assert payload["next_offset"] == 1


def test_create_scope_event_result_supports_typed_values_from_erd() -> None:
    session = MagicMock()
    member = SimpleNamespace(role=2, tenant_id=1)
    body = ScopeResultCreateRequest(
        field_id=7,
        formula_id=13,
        numeric_value="12.5000000000",
    )
    event_row = SimpleNamespace(action_id=3)
    formula_row = SimpleNamespace(id=13, sort_order=2)

    with (
        patch("valora_backend.api.rules._require_scope_rules_editor"),
        patch(
            "valora_backend.api.rules._event_in_scope_or_404",
            return_value=event_row,
        ),
        patch("valora_backend.api.rules._field_in_scope_or_404"),
        patch(
            "valora_backend.api.rules._formula_in_action_or_404",
            return_value=formula_row,
        ),
        patch("valora_backend.api.rules._apply_member_audit_context"),
        patch("valora_backend.api.rules.commit_session_with_null_if_empty"),
        patch(
            "valora_backend.api.rules.list_scope_event_results",
            return_value={"ok": True},
        ) as list_results,
    ):
        response = create_scope_event_result(
            scope_id=5,
            event_id=9,
            body=body,
            member=member,
            session=session,
        )

    assert response == {"ok": True}
    created_row = session.add.call_args.args[0]
    assert isinstance(created_row, Result)
    assert created_row.event_id == 9
    assert created_row.field_id == 7
    assert created_row.formula_id == 13
    assert created_row.formula_order == 2
    assert created_row.text_value is None
    assert created_row.boolean_value is None
    assert str(created_row.numeric_value) == "12.5000000000"
    assert created_row.moment_utc.tzinfo is None
    list_results.assert_called_once_with(5, 9, member, session)


def test_patch_scope_event_result_can_replace_and_clear_typed_values() -> None:
    session = MagicMock()
    member = SimpleNamespace(role=2, tenant_id=1)
    existing_row = Result(
        event_id=9,
        field_id=7,
        formula_id=13,
        formula_order=2,
        text_value=None,
        boolean_value=True,
        numeric_value=None,
        moment_utc=datetime(2026, 4, 6, 12, 0, 0),
    )
    existing_row.id = 11

    body = ScopeResultPatchRequest(
        text_value="  consolidado  ",
        boolean_value=None,
        numeric_value=None,
    )
    event_row = SimpleNamespace(action_id=3)

    with (
        patch("valora_backend.api.rules._require_scope_rules_editor"),
        patch(
            "valora_backend.api.rules._event_in_scope_or_404",
            return_value=event_row,
        ),
        patch(
            "valora_backend.api.rules._result_in_event_or_404",
            return_value=existing_row,
        ) as find_result,
        patch("valora_backend.api.rules._apply_member_audit_context"),
        patch("valora_backend.api.rules.commit_session_with_null_if_empty"),
        patch(
            "valora_backend.api.rules.list_scope_event_results",
            return_value={"ok": True},
        ) as list_results,
    ):
        response = patch_scope_event_result(
            scope_id=5,
            event_id=9,
            result_id=11,
            body=body,
            member=member,
            session=session,
        )

    assert response == {"ok": True}
    assert existing_row.text_value == "consolidado"
    assert existing_row.boolean_value is None
    assert existing_row.numeric_value is None
    session.add.assert_called_with(existing_row)
    find_result.assert_called_once_with(session, event_id=9, result_id=11)
    list_results.assert_called_once_with(5, 9, member, session)


def test_calculate_scope_current_age_executes_formulas_in_order_and_stops_at_final_age() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        current_action = Action(scope_id=scope.id, sort_order=1)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        mirror_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        step_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=4,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                current_action,
                initial_field,
                current_field,
                final_field,
                mirror_field,
                step_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        increment_formula = Formula(
            action_id=current_action.id,
            sort_order=0,
            statement=(
                f"${{field:{current_field.id}}} = "
                f"${{field:{current_field.id}}} + ${{input:{step_field.id}}}"
            ),
        )
        mirror_formula = Formula(
            action_id=current_action.id,
            sort_order=1,
            statement=f"${{field:{mirror_field.id}}} = ${{field:{current_field.id}}}",
        )
        session.add_all([anchor_formula, increment_formula, mirror_formula])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
        )
        current_event_day_2 = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        current_event_day_3 = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 3, 12, 0, 0),
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 12, 0, 0),
        )
        session.add_all(
            [initial_event, current_event_day_2, current_event_day_3, final_event]
        )
        session.flush()

        session.add_all(
            [
                Input(
                    event_id=current_event_day_2.id,
                    field_id=step_field.id,
                    value="1",
                ),
                Input(
                    event_id=current_event_day_3.id,
                    field_id=step_field.id,
                    value="1",
                ),
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 12, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=12,
                    moment_utc=datetime(2026, 4, 4, 12, 0, 0),
                ),
                Result(
                    event_id=current_event_day_2.id,
                    field_id=current_field.id,
                    formula_id=increment_formula.id,
                    formula_order=increment_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=999,
                    moment_utc=datetime(2026, 4, 2, 12, 5, 0),
                ),
                Result(
                    event_id=current_event_day_2.id,
                    field_id=mirror_field.id,
                    formula_id=mirror_formula.id,
                    formula_order=mirror_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=11,
                    moment_utc=datetime(2026, 4, 2, 12, 6, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-04T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 5
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert [
            (
                row.event_id,
                row.formula_id,
                row.formula_order,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.status,
            )
            for row in response.item_list
        ] == [
            (initial_event.id, anchor_formula.id, 0, 10, "created"),
            (current_event_day_2.id, increment_formula.id, 0, 11, "created"),
            (current_event_day_2.id, mirror_formula.id, 1, 11, "created"),
            (current_event_day_3.id, increment_formula.id, 0, 12, "created"),
            (current_event_day_3.id, mirror_formula.id, 1, 12, "created"),
        ]

        calculated_result_row_list = list(
            session.scalars(
                select(Result)
                .where(
                    Result.event_id.in_(
                        [
                            initial_event.id,
                            current_event_day_2.id,
                            current_event_day_3.id,
                            final_event.id,
                        ]
                    )
                )
                .order_by(Result.event_id.asc(), Result.formula_order.asc(), Result.id.asc())
            )
        )
        assert [
            (
                row.event_id,
                row.field_id,
                row.formula_id,
                row.formula_order,
                int(row.numeric_value) if row.numeric_value is not None else None,
            )
            for row in calculated_result_row_list
        ] == [
            (
                initial_event.id,
                current_field.id,
                anchor_formula.id,
                0,
                10,
            ),
            (
                current_event_day_2.id,
                current_field.id,
                increment_formula.id,
                0,
                11,
            ),
            (
                current_event_day_2.id,
                mirror_field.id,
                mirror_formula.id,
                1,
                11,
            ),
            (
                current_event_day_3.id,
                current_field.id,
                increment_formula.id,
                0,
                12,
            ),
            (
                current_event_day_3.id,
                mirror_field.id,
                mirror_formula.id,
                1,
                12,
            ),
        ]


def test_calculate_scope_current_age_filters_out_events_for_non_matching_unity() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        current_action = Action(scope_id=scope.id, sort_order=1)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        mirror_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        step_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=4,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                current_action,
                initial_field,
                current_field,
                final_field,
                mirror_field,
                step_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        increment_formula = Formula(
            action_id=current_action.id,
            sort_order=0,
            statement=(
                f"${{field:{current_field.id}}} = "
                f"${{field:{current_field.id}}} + ${{input:{step_field.id}}}"
            ),
        )
        mirror_formula = Formula(
            action_id=current_action.id,
            sort_order=1,
            statement=f"${{field:{mirror_field.id}}} = ${{field:{current_field.id}}}",
        )
        session.add_all([anchor_formula, increment_formula, mirror_formula])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        unity_match = Unity(
            name="#match",
            location_id=location.id,
            item_id_list=[item.id],
        )
        unity_other = Unity(
            name="#other",
            location_id=location.id,
            item_id_list=[item.id],
        )
        session.add_all([unity_match, unity_other])
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
            unity_id=unity_match.id,
        )
        current_event_day_2 = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
            unity_id=unity_match.id,
        )
        current_event_day_3 = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 3, 12, 0, 0),
            unity_id=unity_match.id,
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 12, 0, 0),
            unity_id=unity_match.id,
        )
        session.add_all(
            [initial_event, current_event_day_2, current_event_day_3, final_event]
        )
        session.flush()

        session.add_all(
            [
                Input(
                    event_id=current_event_day_2.id,
                    field_id=step_field.id,
                    value="1",
                ),
                Input(
                    event_id=current_event_day_3.id,
                    field_id=step_field.id,
                    value="1",
                ),
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 12, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=12,
                    moment_utc=datetime(2026, 4, 4, 12, 0, 0),
                ),
                Result(
                    event_id=current_event_day_2.id,
                    field_id=current_field.id,
                    formula_id=increment_formula.id,
                    formula_order=increment_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=999,
                    moment_utc=datetime(2026, 4, 2, 12, 5, 0),
                ),
                Result(
                    event_id=current_event_day_2.id,
                    field_id=mirror_field.id,
                    formula_id=mirror_formula.id,
                    formula_order=mirror_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=11,
                    moment_utc=datetime(2026, 4, 2, 12, 6, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-04T23:59:00Z",
                unity_id=unity_other.id,
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.empty_reason == "no_events_before_period_end"
        assert response.item_list == []


def test_read_scope_current_age_reads_existing_results_without_recalculation() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        action = Action(scope_id=scope.id, sort_order=0)
        field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all([location, kind, action, field, initial_field, final_field])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        formula = Formula(
            action_id=action.id,
            sort_order=0,
            statement=f"${{field:{field.id}}} = ${{field:{field.id}}}",
        )
        session.add(formula)
        session.flush()

        event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        session.add(event)
        session.flush()

        result = Result(
            event_id=event.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=11,
            moment_utc=datetime(2026, 4, 2, 12, 5, 0),
        )
        session.add(result)
        session.commit()

        response = read_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 0
        assert response.updated_count == 0
        assert response.unchanged_count == 1
        assert [
            (
                row.event_id,
                row.formula_id,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.status,
            )
            for row in response.item_list
        ] == [
            (event.id, formula.id, 11, "unchanged"),
        ]


def test_read_scope_current_age_filters_by_unity_id() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        action = Action(scope_id=scope.id, sort_order=0)
        field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all([location, kind, action, field, initial_field, final_field])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        unity_a = Unity(
            name="#a",
            location_id=location.id,
            item_id_list=[item.id],
        )
        unity_b = Unity(
            name="#b",
            location_id=location.id,
            item_id_list=[item.id],
        )
        session.add_all([unity_a, unity_b])
        session.flush()

        formula = Formula(
            action_id=action.id,
            sort_order=0,
            statement=f"${{field:{field.id}}} = ${{field:{field.id}}}",
        )
        session.add(formula)
        session.flush()

        event_a = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
            unity_id=unity_a.id,
        )
        event_b = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 14, 0, 0),
            unity_id=unity_b.id,
        )
        session.add_all([event_a, event_b])
        session.flush()

        result_a = Result(
            event_id=event_a.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=11,
            moment_utc=datetime(2026, 4, 2, 12, 5, 0),
        )
        result_b = Result(
            event_id=event_b.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=22,
            moment_utc=datetime(2026, 4, 2, 14, 5, 0),
        )
        session.add_all([result_a, result_b])
        session.commit()

        filtered = read_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
                unity_id=unity_a.id,
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )
        assert filtered.unchanged_count == 1
        assert [(row.event_id, int(row.numeric_value or 0)) for row in filtered.item_list] == [
            (event_a.id, 11),
        ]

        all_rows = read_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )
        assert all_rows.unchanged_count == 2


def test_delete_scope_current_age_removes_results_in_selected_period() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        action = Action(scope_id=scope.id, sort_order=0)
        field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all([location, kind, action, field, initial_field, final_field])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        formula = Formula(
            action_id=action.id,
            sort_order=0,
            statement=f"${{field:{field.id}}} = ${{field:{field.id}}}",
        )
        session.add(formula)
        session.flush()

        kept_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 1, 8, 0, 0),
        )
        deleted_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        session.add_all([kept_event, deleted_event])
        session.flush()

        kept_result = Result(
            event_id=kept_event.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=10,
            moment_utc=datetime(2026, 4, 1, 8, 5, 0),
        )
        deleted_result = Result(
            event_id=deleted_event.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=11,
            moment_utc=datetime(2026, 4, 2, 12, 5, 0),
        )
        session.add_all([kept_result, deleted_result])
        session.commit()

        response = delete_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-02T00:00:00Z",
                moment_to_utc="2026-04-02T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        remaining_result_id_list = list(session.scalars(select(Result.id).order_by(Result.id)))

        assert response.created_count == 0
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert response.item_list == []
        assert remaining_result_id_list == [kept_result.id]


def test_delete_scope_current_age_filters_by_unity_id() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        action = Action(scope_id=scope.id, sort_order=0)
        field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all([location, kind, action, field, initial_field, final_field])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        unity_a = Unity(
            name="#a",
            location_id=location.id,
            item_id_list=[item.id],
        )
        unity_b = Unity(
            name="#b",
            location_id=location.id,
            item_id_list=[item.id],
        )
        session.add_all([unity_a, unity_b])
        session.flush()

        formula = Formula(
            action_id=action.id,
            sort_order=0,
            statement=f"${{field:{field.id}}} = ${{field:{field.id}}}",
        )
        session.add(formula)
        session.flush()

        event_a = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 10, 0, 0),
            unity_id=unity_a.id,
        )
        event_b = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
            unity_id=unity_b.id,
        )
        session.add_all([event_a, event_b])
        session.flush()

        result_a = Result(
            event_id=event_a.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=10,
            moment_utc=datetime(2026, 4, 2, 10, 5, 0),
        )
        result_b = Result(
            event_id=event_b.id,
            field_id=field.id,
            formula_id=formula.id,
            formula_order=formula.sort_order,
            text_value=None,
            boolean_value=None,
            numeric_value=11,
            moment_utc=datetime(2026, 4, 2, 12, 5, 0),
        )
        session.add_all([result_a, result_b])
        session.commit()

        delete_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-02T00:00:00Z",
                moment_to_utc="2026-04-02T23:59:00Z",
                unity_id=unity_a.id,
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        remaining = list(session.scalars(select(Result.id).order_by(Result.id)))
        assert remaining == [result_b.id]


def test_calculate_scope_current_age_uses_action_sort_order_within_same_day() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        plus_action = Action(scope_id=scope.id, sort_order=10)
        double_action = Action(scope_id=scope.id, sort_order=20)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                plus_action,
                double_action,
                initial_field,
                current_field,
                final_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        plus_formula = Formula(
            action_id=plus_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        double_formula = Formula(
            action_id=double_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} * 2",
        )
        session.add_all([anchor_formula, plus_formula, double_formula])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
        )
        double_event_same_day = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=double_action.id,
            moment_utc=datetime(2026, 4, 2, 8, 0, 0),
        )
        plus_event_same_day = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=plus_action.id,
            moment_utc=datetime(2026, 4, 2, 18, 0, 0),
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 3, 12, 0, 0),
        )
        session.add_all(
            [initial_event, double_event_same_day, plus_event_same_day, final_event]
        )
        session.flush()

        session.add_all(
            [
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 12, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=22,
                    moment_utc=datetime(2026, 4, 3, 12, 0, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 3
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert [
            (
                row.event_id,
                row.formula_id,
                int(row.numeric_value) if row.numeric_value is not None else None,
            )
            for row in response.item_list
        ] == [
            (initial_event.id, anchor_formula.id, 10),
            (plus_event_same_day.id, plus_formula.id, 11),
            (double_event_same_day.id, double_formula.id, 22),
        ]


def test_calculate_scope_current_age_rounds_numeric_result_to_field_scale_half_up() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        calc_action = Action(scope_id=scope.id, sort_order=1)
        session.add_all([location, kind, anchor_action, calc_action])
        session.flush()

        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        source_field = Field(
            scope_id=scope.id,
            type="NUMERIC(15, 3)",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        rounded_field = Field(
            scope_id=scope.id,
            type="NUMERIC(15, 2)",
            sort_order=4,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        mirrored_field = Field(
            scope_id=scope.id,
            type="NUMERIC(15, 2)",
            sort_order=5,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                initial_field,
                current_field,
                final_field,
                source_field,
                rounded_field,
                mirrored_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        rounded_formula = Formula(
            action_id=calc_action.id,
            sort_order=0,
            statement=f"${{field:{rounded_field.id}}} = ${{input:{source_field.id}}}",
        )
        mirrored_formula = Formula(
            action_id=calc_action.id,
            sort_order=1,
            statement=f"${{field:{mirrored_field.id}}} = ${{field:{rounded_field.id}}}",
        )
        session.add_all([anchor_formula, rounded_formula, mirrored_formula])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 8, 0, 0),
        )
        calc_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=calc_action.id,
            moment_utc=datetime(2026, 4, 2, 8, 0, 0),
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 3, 8, 0, 0),
        )
        session.add_all([initial_event, calc_event, final_event])
        session.flush()

        session.add_all(
            [
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 8, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=12,
                    moment_utc=datetime(2026, 4, 3, 8, 0, 0),
                ),
                Input(
                    event_id=calc_event.id,
                    field_id=source_field.id,
                    value="1.235",
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert [
            (row.field_id, Decimal(str(row.numeric_value)))
            for row in response.item_list
            if row.event_id == calc_event.id
        ] == [
            (rounded_field.id, Decimal("1.24")),
            (mirrored_field.id, Decimal("1.24")),
        ]

        persisted_result_list = list(
            session.scalars(
                select(Result)
                .where(Result.event_id == calc_event.id)
                .order_by(Result.formula_order.asc(), Result.id.asc())
            )
        )
        assert [
            (row.field_id, row.numeric_value)
            for row in persisted_result_list
        ] == [
            (rounded_field.id, Decimal("1.24")),
            (mirrored_field.id, Decimal("1.24")),
        ]


def test_calculate_scope_current_age_keeps_processing_remaining_events_in_final_day() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        final_day_first_action = Action(scope_id=scope.id, sort_order=1)
        final_day_last_action = Action(scope_id=scope.id, sort_order=2)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        mirror_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                final_day_first_action,
                final_day_last_action,
                initial_field,
                current_field,
                final_field,
                mirror_field,
            ]
        )
        session.flush()

        anchor_current_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        final_day_increment_formula = Formula(
            action_id=final_day_first_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        final_day_mirror_formula = Formula(
            action_id=final_day_first_action.id,
            sort_order=1,
            statement=f"${{field:{mirror_field.id}}} = ${{field:{current_field.id}}}",
        )
        final_day_anchor_formula = Formula(
            action_id=final_day_last_action.id,
            sort_order=0,
            statement=f"${{field:{mirror_field.id}}} = ${{field:{current_field.id}}}",
        )
        session.add_all(
            [
                anchor_current_formula,
                final_day_increment_formula,
                final_day_mirror_formula,
                final_day_anchor_formula,
            ]
        )
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 8, 0, 0),
        )
        first_event_on_final_day = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=final_day_first_action.id,
            moment_utc=datetime(2026, 4, 3, 8, 0, 0),
        )
        second_event_on_final_day = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=final_day_last_action.id,
            moment_utc=datetime(2026, 4, 3, 18, 0, 0),
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 8, 0, 0),
        )
        session.add_all(
            [
                initial_event,
                first_event_on_final_day,
                second_event_on_final_day,
                final_event,
            ]
        )
        session.flush()

        session.add_all(
            [
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_current_formula.id,
                    formula_order=anchor_current_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 8, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_current_formula.id,
                    formula_order=anchor_current_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=11,
                    moment_utc=datetime(2026, 4, 4, 8, 0, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-04T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert [
            (
                row.event_id,
                row.formula_id,
                row.formula_order,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.result_moment_utc.date().isoformat(),
            )
            for row in response.item_list
        ] == [
            (initial_event.id, anchor_current_formula.id, 0, 10, "2026-04-01"),
            (first_event_on_final_day.id, final_day_increment_formula.id, 0, 11, "2026-04-03"),
            (first_event_on_final_day.id, final_day_mirror_formula.id, 1, 11, "2026-04-03"),
            (second_event_on_final_day.id, final_day_anchor_formula.id, 0, 11, "2026-04-03"),
        ]


def test_calculate_scope_current_age_defaults_missing_result_state_by_field_type() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        current_action = Action(scope_id=scope.id, sort_order=1)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        numeric_field = Field(
            scope_id=scope.id,
            type="NUMERIC",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        text_field = Field(
            scope_id=scope.id,
            type="TEXT",
            sort_order=4,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        boolean_field = Field(
            scope_id=scope.id,
            type="BOOLEAN",
            sort_order=5,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                current_action,
                initial_field,
                current_field,
                final_field,
                numeric_field,
                text_field,
                boolean_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        numeric_formula = Formula(
            action_id=current_action.id,
            sort_order=0,
            statement=(
                f"${{field:{current_field.id}}} = "
                f"${{field:{current_field.id}}} + ${{field:{numeric_field.id}}} + 1"
            ),
        )
        text_formula = Formula(
            action_id=current_action.id,
            sort_order=1,
            statement=f"${{field:{text_field.id}}} = ${{field:{text_field.id}}} + 'ok'",
        )
        boolean_formula = Formula(
            action_id=current_action.id,
            sort_order=2,
            statement=f"${{field:{boolean_field.id}}} = not ${{field:{boolean_field.id}}}",
        )
        session.add_all([anchor_formula, numeric_formula, text_formula, boolean_formula])
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        initial_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
        )
        current_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        final_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 3, 12, 0, 0),
        )
        session.add_all([initial_event, current_event, final_event])
        session.flush()

        session.add_all(
            [
                Result(
                    event_id=initial_event.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 12, 0, 0),
                ),
                Result(
                    event_id=final_event.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=11,
                    moment_utc=datetime(2026, 4, 3, 12, 0, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 4
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert [
            (
                row.event_id,
                row.formula_id,
                row.formula_order,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.text_value,
                row.boolean_value,
                row.status,
            )
            for row in response.item_list
        ] == [
            (initial_event.id, anchor_formula.id, 0, 10, None, None, "created"),
            (current_event.id, numeric_formula.id, 0, 11, None, None, "created"),
            (current_event.id, text_formula.id, 1, None, "ok", None, "created"),
            (current_event.id, boolean_formula.id, 2, None, None, True, "created"),
        ]


def test_calculate_scope_current_age_opens_window_from_age_inputs_and_keeps_future_events() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        current_action = Action(scope_id=scope.id, sort_order=1)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                current_action,
                initial_field,
                current_field,
                final_field,
            ]
        )
        session.flush()

        initial_from_input_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{initial_field.id}}} = ${{input:{initial_field.id}}}",
        )
        current_from_initial_formula = Formula(
            action_id=anchor_action.id,
            sort_order=1,
            statement=f"${{field:{current_field.id}}} = ${{field:{initial_field.id}}}",
        )
        final_from_input_formula = Formula(
            action_id=anchor_action.id,
            sort_order=2,
            statement=f"${{field:{final_field.id}}} = ${{input:{final_field.id}}}",
        )
        increment_formula = Formula(
            action_id=current_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        session.add_all(
            [
                initial_from_input_formula,
                current_from_initial_formula,
                final_from_input_formula,
                increment_formula,
            ]
        )
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        alojamento_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
        )
        idade_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        session.add_all([alojamento_event, idade_event])
        session.flush()

        session.add_all(
            [
                Input(
                    event_id=alojamento_event.id,
                    field_id=initial_field.id,
                    value="10",
                ),
                Input(
                    event_id=alojamento_event.id,
                    field_id=final_field.id,
                    value="20",
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-02T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 4
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert [
            (
                row.event_id,
                row.formula_id,
                row.formula_order,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.status,
            )
            for row in response.item_list
        ] == [
            (alojamento_event.id, initial_from_input_formula.id, 0, 10, "created"),
            (alojamento_event.id, current_from_initial_formula.id, 1, 10, "created"),
            (alojamento_event.id, final_from_input_formula.id, 2, 20, "created"),
            (idade_event.id, increment_formula.id, 0, 11, "created"),
        ]


def test_calculate_scope_current_age_repeats_recurrent_event_on_following_days() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        recurrent_age_action = Action(scope_id=scope.id, sort_order=1, is_recurrent=True)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                recurrent_age_action,
                initial_field,
                current_field,
                final_field,
            ]
        )
        session.flush()

        anchor_initial_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{initial_field.id}}} = ${{input:{initial_field.id}}}",
        )
        anchor_current_formula = Formula(
            action_id=anchor_action.id,
            sort_order=1,
            statement=f"${{field:{current_field.id}}} = ${{field:{initial_field.id}}}",
        )
        anchor_final_formula = Formula(
            action_id=anchor_action.id,
            sort_order=2,
            statement=f"${{field:{final_field.id}}} = ${{input:{final_field.id}}}",
        )
        recurrent_increment_formula = Formula(
            action_id=recurrent_age_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        session.add_all(
            [
                anchor_initial_formula,
                anchor_current_formula,
                anchor_final_formula,
                recurrent_increment_formula,
            ]
        )
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        alojamento_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 8, 0, 0),
        )
        idade_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=recurrent_age_action.id,
            moment_utc=datetime(2026, 4, 4, 9, 0, 0),
        )
        session.add_all([alojamento_event, idade_event])
        session.flush()

        session.add_all(
            [
                Input(event_id=alojamento_event.id, field_id=initial_field.id, value="10"),
                Input(event_id=alojamento_event.id, field_id=final_field.id, value="12"),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-04T00:00:00Z",
                moment_to_utc="2026-04-10T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert [
            (
                row.event_id,
                row.formula_id,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.result_moment_utc.date().isoformat(),
            )
            for row in response.item_list
        ] == [
            (alojamento_event.id, anchor_initial_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_current_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_final_formula.id, 12, "2026-04-04"),
            (idade_event.id, recurrent_increment_formula.id, 11, "2026-04-04"),
            (idade_event.id, recurrent_increment_formula.id, 12, "2026-04-05"),
        ]


def test_calculate_scope_current_age_ignores_age_input_without_formula_target() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        unrelated_action = Action(scope_id=scope.id, sort_order=1, is_recurrent=False)
        recurrent_age_action = Action(scope_id=scope.id, sort_order=2, is_recurrent=True)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                unrelated_action,
                recurrent_age_action,
                initial_field,
                current_field,
                final_field,
            ]
        )
        session.flush()

        anchor_initial_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{initial_field.id}}} = ${{input:{initial_field.id}}}",
        )
        anchor_current_formula = Formula(
            action_id=anchor_action.id,
            sort_order=1,
            statement=f"${{field:{current_field.id}}} = ${{field:{initial_field.id}}}",
        )
        anchor_final_formula = Formula(
            action_id=anchor_action.id,
            sort_order=2,
            statement=f"${{field:{final_field.id}}} = ${{input:{final_field.id}}}",
        )
        recurrent_increment_formula = Formula(
            action_id=recurrent_age_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        unrelated_formula = Formula(
            action_id=unrelated_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        session.add_all(
            [
                anchor_initial_formula,
                anchor_current_formula,
                anchor_final_formula,
                recurrent_increment_formula,
                unrelated_formula,
            ]
        )
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        alojamento_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 8, 0, 0),
        )
        unrelated_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=unrelated_action.id,
            moment_utc=datetime(2026, 4, 4, 10, 0, 0),
        )
        idade_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=recurrent_age_action.id,
            moment_utc=datetime(2026, 4, 4, 11, 0, 0),
        )
        session.add_all([alojamento_event, unrelated_event, idade_event])
        session.flush()

        session.add_all(
            [
                Input(event_id=alojamento_event.id, field_id=initial_field.id, value="10"),
                Input(event_id=alojamento_event.id, field_id=final_field.id, value="12"),
                Input(event_id=unrelated_event.id, field_id=final_field.id, value="100"),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-04T00:00:00Z",
                moment_to_utc="2026-04-10T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert [
            (
                row.event_id,
                row.formula_id,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.result_moment_utc.date().isoformat(),
            )
            for row in response.item_list
        ] == [
            (alojamento_event.id, anchor_initial_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_current_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_final_formula.id, 12, "2026-04-04"),
            (unrelated_event.id, unrelated_formula.id, 10, "2026-04-04"),
            (idade_event.id, recurrent_increment_formula.id, 11, "2026-04-04"),
            (idade_event.id, recurrent_increment_formula.id, 12, "2026-04-05"),
        ]


def test_calculate_scope_current_age_does_not_repeat_non_recurrent_event_on_following_days() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        single_age_action = Action(scope_id=scope.id, sort_order=1, is_recurrent=False)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        session.add_all(
            [
                location,
                kind,
                anchor_action,
                single_age_action,
                initial_field,
                current_field,
                final_field,
            ]
        )
        session.flush()

        anchor_initial_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{initial_field.id}}} = ${{input:{initial_field.id}}}",
        )
        anchor_current_formula = Formula(
            action_id=anchor_action.id,
            sort_order=1,
            statement=f"${{field:{current_field.id}}} = ${{field:{initial_field.id}}}",
        )
        anchor_final_formula = Formula(
            action_id=anchor_action.id,
            sort_order=2,
            statement=f"${{field:{final_field.id}}} = ${{input:{final_field.id}}}",
        )
        single_increment_formula = Formula(
            action_id=single_age_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}} + 1",
        )
        session.add_all(
            [
                anchor_initial_formula,
                anchor_current_formula,
                anchor_final_formula,
                single_increment_formula,
            ]
        )
        session.flush()

        item = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        session.add(item)
        session.flush()

        alojamento_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 4, 8, 0, 0),
        )
        idade_event = Event(
            location_id=location.id,
            item_id=item.id,
            action_id=single_age_action.id,
            moment_utc=datetime(2026, 4, 4, 9, 0, 0),
        )
        session.add_all([alojamento_event, idade_event])
        session.flush()

        session.add_all(
            [
                Input(event_id=alojamento_event.id, field_id=initial_field.id, value="10"),
                Input(event_id=alojamento_event.id, field_id=final_field.id, value="20"),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-04T00:00:00Z",
                moment_to_utc="2026-04-10T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert [
            (
                row.event_id,
                row.formula_id,
                int(row.numeric_value) if row.numeric_value is not None else None,
                row.result_moment_utc.date().isoformat(),
            )
            for row in response.item_list
        ] == [
            (alojamento_event.id, anchor_initial_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_current_formula.id, 10, "2026-04-04"),
            (alojamento_event.id, anchor_final_formula.id, 20, "2026-04-04"),
            (idade_event.id, single_increment_formula.id, 11, "2026-04-04"),
        ]


def test_calculate_scope_current_age_does_not_mix_different_location_item_groups() -> None:
    with build_rules_session() as (session, tenant_id):
        scope = Scope(
            name="Aves",
            tenant_id=tenant_id,
        )
        session.add(scope)
        session.flush()

        location_a = Location(
            name="Granja A",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=0,
        )
        location_b = Location(
            name="Granja B",
            scope_id=scope.id,
            parent_location_id=None,
            sort_order=1,
        )
        kind = Kind(scope_id=scope.id, name="lote")
        anchor_action = Action(scope_id=scope.id, sort_order=0)
        current_action = Action(scope_id=scope.id, sort_order=1)
        initial_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=0,
            is_initial_age=True,
            is_final_age=False,
            is_current_age=False,
        )
        current_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=1,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=True,
        )
        final_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=True,
            is_current_age=False,
        )
        step_field = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=3,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        session.add_all(
            [
                location_a,
                location_b,
                kind,
                anchor_action,
                current_action,
                initial_field,
                current_field,
                final_field,
                step_field,
            ]
        )
        session.flush()

        anchor_formula = Formula(
            action_id=anchor_action.id,
            sort_order=0,
            statement=f"${{field:{current_field.id}}} = ${{field:{current_field.id}}}",
        )
        increment_formula = Formula(
            action_id=current_action.id,
            sort_order=0,
            statement=(
                f"${{field:{current_field.id}}} = "
                f"${{field:{current_field.id}}} + ${{input:{step_field.id}}}"
            ),
        )
        session.add_all([anchor_formula, increment_formula])
        session.flush()

        item_a = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=0,
        )
        item_b = Item(
            scope_id=scope.id,
            kind_id=kind.id,
            parent_item_id=None,
            sort_order=1,
        )
        session.add_all([item_a, item_b])
        session.flush()

        initial_event_group_a = Event(
            location_id=location_a.id,
            item_id=item_a.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 1, 12, 0, 0),
        )
        current_event_group_b = Event(
            location_id=location_b.id,
            item_id=item_b.id,
            action_id=current_action.id,
            moment_utc=datetime(2026, 4, 2, 12, 0, 0),
        )
        final_event_group_b = Event(
            location_id=location_b.id,
            item_id=item_b.id,
            action_id=anchor_action.id,
            moment_utc=datetime(2026, 4, 3, 12, 0, 0),
        )
        session.add_all([initial_event_group_a, current_event_group_b, final_event_group_b])
        session.flush()

        session.add_all(
            [
                Input(
                    event_id=current_event_group_b.id,
                    field_id=step_field.id,
                    value="1",
                ),
                Result(
                    event_id=initial_event_group_a.id,
                    field_id=initial_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=10,
                    moment_utc=datetime(2026, 4, 1, 12, 0, 0),
                ),
                Result(
                    event_id=final_event_group_b.id,
                    field_id=final_field.id,
                    formula_id=anchor_formula.id,
                    formula_order=anchor_formula.sort_order,
                    text_value=None,
                    boolean_value=None,
                    numeric_value=12,
                    moment_utc=datetime(2026, 4, 3, 12, 0, 0),
                ),
            ]
        )
        session.commit()

        response = calculate_scope_current_age(
            scope_id=scope.id,
            body=ScopeCurrentAgeCalculationRequest(
                moment_from_utc="2026-04-01T00:00:00Z",
                moment_to_utc="2026-04-03T23:59:00Z",
            ),
            member=SimpleNamespace(role=2, tenant_id=tenant_id, account_id=1),
            session=session,
        )

        assert response.created_count == 0
        assert response.updated_count == 0
        assert response.unchanged_count == 0
        assert response.item_list == []
        assert session.scalar(
            select(Result.id)
            .where(
                Result.event_id == current_event_group_b.id,
                Result.formula_id == increment_formula.id,
            )
            .limit(1)
        ) is None
