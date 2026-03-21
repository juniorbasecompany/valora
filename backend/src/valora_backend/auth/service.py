from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from valora_backend.model.identity import Member, Tenant


class LoginAction(StrEnum):
    ISSUE_TOKEN = "issue_token"
    SELECT_TENANT = "select_tenant"
    CREATE_TENANT = "create_tenant"


MASTER_ROLE = 1
ADMIN_ROLE = 2
MEMBER_ROLE = 3


@dataclass(slots=True)
class LoginDecision:
    action: LoginAction


def build_account_name(name: str | None, email: str) -> tuple[str, str]:
    """Normaliza `name` e `display_name` mínimos para a conta autenticada."""
    clean_name = (name or "").strip()
    if clean_name:
        return clean_name, clean_name

    email_prefix = email.split("@", 1)[0].strip()
    fallback_name = email_prefix or email
    return fallback_name, fallback_name


def member_status_name(status: int) -> str:
    if status == 1:
        return "ACTIVE"
    if status == 2:
        return "PENDING"
    if status == 3:
        return "DISABLED"
    return "UNKNOWN"


def member_role_name(role: int) -> str:
    if role == MASTER_ROLE:
        return "master"
    if role == ADMIN_ROLE:
        return "admin"
    if role == MEMBER_ROLE:
        return "member"
    return "unknown"


def member_display_name(member: Member) -> str:
    if member.display_name:
        display_name = member.display_name.strip()
        if display_name:
            return display_name

    if member.name:
        name = member.name.strip()
        if name:
            return name

    return member.email


def tenant_display_name(tenant: Tenant) -> str:
    display_name = tenant.display_name.strip()
    if display_name:
        return display_name

    return tenant.name


def decide_login_action(*, active_count: int, pending_count: int) -> LoginDecision:
    if active_count == 0 and pending_count == 0:
        return LoginDecision(action=LoginAction.CREATE_TENANT)

    if active_count == 1 and pending_count == 0:
        return LoginDecision(action=LoginAction.ISSUE_TOKEN)

    return LoginDecision(action=LoginAction.SELECT_TENANT)
