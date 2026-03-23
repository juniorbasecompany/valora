from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from valora_backend.auth.dependencies import get_current_member, get_current_tenant
from valora_backend.db import get_session
from valora_backend.main import create_app
from valora_backend.model.base import Base
from valora_backend.model.identity import Account, Location, Member, Scope, Tenant


@contextmanager
def build_test_client(
    *, current_member_key: str, with_scopes: bool = True
) -> Generator[tuple[TestClient, Session, dict[str, int]], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(engine)

    session = testing_session_local()
    tenant = Tenant(name="Acme Agro Ltda.", display_name="Acme Agro")
    session.add(tenant)
    session.flush()

    master_account = Account(
        name="Master User",
        display_name="Master User",
        email="master@example.com",
        provider="google",
        provider_subject="google-master",
    )
    admin_account = Account(
        name="Admin User",
        display_name="Admin User",
        email="admin@example.com",
        provider="google",
        provider_subject="google-admin",
    )
    member_account = Account(
        name="Member User",
        display_name="Member User",
        email="member@example.com",
        provider="google",
        provider_subject="google-member",
    )
    session.add_all([master_account, admin_account, member_account])
    session.flush()

    master_member = Member(
        name="Master User",
        display_name="Master User",
        email=master_account.email,
        tenant_id=tenant.id,
        account_id=master_account.id,
        role=1,
        status=1,
    )
    admin_member = Member(
        name="Admin User",
        display_name="Admin User",
        email=admin_account.email,
        tenant_id=tenant.id,
        account_id=admin_account.id,
        role=2,
        status=1,
    )
    active_member = Member(
        name="Member User",
        display_name="Member User",
        email=member_account.email,
        tenant_id=tenant.id,
        account_id=member_account.id,
        role=3,
        status=1,
    )
    pending_member = Member(
        name="Pending Invite",
        display_name="Pending Invite",
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
            display_name="Aves para producao de ovos",
            tenant_id=tenant.id,
        )
        grain_scope = Scope(
            name="Soja",
            display_name="Soja em graos",
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

    app = create_app()

    def override_get_session():
        yield session

    def override_get_current_member():
        return session.get(Member, member_id_by_key[current_member_key])

    def override_get_current_tenant():
        return session.get(Tenant, tenant.id)

    app.dependency_overrides[get_session] = override_get_session
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


def test_get_current_tenant_member_directory_exposes_capabilities() -> None:
    with build_test_client(current_member_key="master") as (client, _, member_id_by_key):
        response = client.get("/auth/tenant/current/members")

    assert response.status_code == 200
    payload = response.json()
    member_map = {item["id"]: item for item in payload["item_list"]}

    assert payload["can_edit"] is True
    assert member_map[member_id_by_key["master"]]["can_edit_access"] is False
    assert member_map[member_id_by_key["master"]]["can_delete"] is False
    assert member_map[member_id_by_key["admin"]]["can_edit"] is True
    assert member_map[member_id_by_key["admin"]]["can_edit_access"] is True
    assert member_map[member_id_by_key["admin"]]["can_delete"] is True
    assert member_map[member_id_by_key["pending"]]["status"] == "PENDING"


def test_admin_can_update_member_profile_without_changing_access() -> None:
    with build_test_client(current_member_key="admin") as (
        client,
        session,
        member_id_by_key,
    ):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "name": "Member Updated",
                "display_name": "Updated Member",
                "role": 3,
                "status": 1,
            },
        )
        session.expire_all()
        updated_member = session.get(Member, member_id_by_key["member"])

    assert response.status_code == 200
    assert updated_member is not None
    assert updated_member.name == "Member Updated"
    assert updated_member.display_name == "Updated Member"
    assert updated_member.role == 3
    assert updated_member.status == 1


def test_admin_cannot_change_member_access() -> None:
    with build_test_client(current_member_key="admin") as (client, _, member_id_by_key):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['member']}",
            json={
                "name": "Member Updated",
                "display_name": "Updated Member",
                "role": 2,
                "status": 1,
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Only master members can change role or status for this record"
    )


def test_master_cannot_activate_member_without_linked_account() -> None:
    with build_test_client(current_member_key="master") as (client, _, member_id_by_key):
        response = client.patch(
            f"/auth/tenant/current/members/{member_id_by_key['pending']}",
            json={
                "name": "Pending Invite",
                "display_name": "Pending Invite",
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
    assert all(item["id"] != member_id_by_key["member"] for item in payload["item_list"])


def test_master_cannot_delete_self_member_record() -> None:
    with build_test_client(current_member_key="master") as (client, _, member_id_by_key):
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
                "display_name": "Leite para operacao primaria",
            },
        )
        session.expire_all()
        created_scope = session.scalar(select(Scope).where(Scope.name == "Leite"))
        assert created_scope is not None
        update_response = client.patch(
            f"/auth/tenant/current/scopes/{created_scope.id}",
            json={
                "name": "Leite",
                "display_name": "Leite e derivados",
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
        item["display_name"] == "Leite e derivados"
        for item in update_payload["item_list"]
    )

    assert delete_response.status_code == 200
    assert deleted_scope is None


def test_member_cannot_create_scope() -> None:
    with build_test_client(current_member_key="member") as (client, _, _):
        response = client.post(
            "/auth/tenant/current/scopes",
            json={
                "name": "Cafe",
                "display_name": "Cafe em graos",
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
                "display_name": "Fazenda Norte principal",
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
                "display_name": "Aviário de postura B",
                "parent_location_id": root_location.id,
            },
        )
        session.expire_all()
        child_location = session.scalar(select(Location).where(Location.name == "Aviário B"))
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
                "name": "Aviário B",
                "display_name": "Aviário de postura reformado",
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
        item for item in move_response.json()["item_list"] if item["id"] == child_location.id
    )
    assert moved_child["parent_location_id"] is None
    assert moved_child["sort_order"] == 0

    assert update_response.status_code == 200
    assert updated_child is not None
    assert updated_child.display_name == "Aviário de postura reformado"

    assert delete_response.status_code == 200
    assert deleted_root is None


def test_location_delete_is_blocked_when_location_has_children() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Granja Sul",
                "display_name": "Granja Sul",
                "parent_location_id": None,
            },
        )
        session.expire_all()
        parent_location = session.scalar(select(Location).where(Location.name == "Granja Sul"))
        assert parent_location is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Núcleo 1",
                "display_name": "Núcleo 1",
                "parent_location_id": parent_location.id,
            },
        )

        response = client.delete(
            f"/auth/tenant/current/scopes/{scope_id}/locations/{parent_location.id}"
        )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Cannot delete location while it still has child locations"
    )


def test_location_move_cannot_create_cycle() -> None:
    with build_test_client(current_member_key="admin") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Unidade Oeste",
                "display_name": "Unidade Oeste",
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
                "display_name": "Setor A",
                "parent_location_id": parent_location.id,
            },
        )
        session.expire_all()
        child_location = session.scalar(select(Location).where(Location.name == "Setor A"))
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
                "display_name": "Matriz operacional",
                "parent_location_id": None,
            },
        )

        response = client.delete(f"/auth/tenant/current/scopes/{scope_id}")

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot delete scope while it still has locations"


def test_member_cannot_create_location() -> None:
    with build_test_client(current_member_key="member") as (client, session, _):
        scope_id = session.scalar(select(Scope.id).where(Scope.name == "Aves"))
        assert scope_id is not None

        response = client.post(
            f"/auth/tenant/current/scopes/{scope_id}/locations",
            json={
                "name": "Base",
                "display_name": "Base",
                "parent_location_id": None,
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions to create location"
