from valora_backend.auth.service import (
    ADMIN_ROLE,
    LoginAction,
    MASTER_ROLE,
    MEMBER_ROLE,
    build_account_name,
    decide_login_action,
    member_role_name,
    member_status_name,
)


def test_decide_login_action_for_create_tenant() -> None:
    decision = decide_login_action(active_count=0, pending_count=0)
    assert decision.action == LoginAction.CREATE_TENANT


def test_decide_login_action_for_direct_access() -> None:
    decision = decide_login_action(active_count=1, pending_count=0)
    assert decision.action == LoginAction.ISSUE_TOKEN


def test_decide_login_action_for_selection() -> None:
    decision = decide_login_action(active_count=2, pending_count=1)
    assert decision.action == LoginAction.SELECT_TENANT


def test_build_account_name_uses_google_name_when_present() -> None:
    name = build_account_name("Maria Silva", "maria@example.com")
    assert name == "Maria Silva"


def test_build_account_name_uses_email_prefix_as_fallback() -> None:
    name = build_account_name("", "maria.silva@example.com")
    assert name == "maria.silva"


def test_member_status_name_maps_supported_statuses() -> None:
    assert member_status_name(1) == "ACTIVE"
    assert member_status_name(2) == "PENDING"
    assert member_status_name(3) == "DISABLED"


def test_member_role_name_maps_supported_roles() -> None:
    assert member_role_name(MASTER_ROLE) == "master"
    assert member_role_name(ADMIN_ROLE) == "admin"
    assert member_role_name(MEMBER_ROLE) == "member"
