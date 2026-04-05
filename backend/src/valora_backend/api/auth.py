from __future__ import annotations

import json
from collections.abc import Callable
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, literal, or_, select, text
from sqlalchemy.orm import Session, contains_eager, joinedload

from valora_backend.auth.dependencies import (
    get_current_account,
    get_current_member,
    get_current_tenant,
)
from valora_backend.auth.google import GoogleIdentity, verify_google_token
from valora_backend.auth.jwt import create_access_token
from valora_backend.auth.service import (
    ADMIN_ROLE,
    LoginAction,
    MASTER_ROLE,
    MEMBER_ROLE,
    build_account_name,
    decide_login_action,
    member_display_name,
    member_role_name,
    member_status_name,
    tenant_display_name,
)
from valora_backend.api.scope_hierarchy_directory_support import (
    hierarchy_item_label,
    hierarchy_sort_key,
    move_hierarchy_node_in_scope,
    normalize_scope_hierarchy_order,
    validate_scope_hierarchy_parent_change,
)
from valora_backend.audit_request import (
    apply_audit_gucs_for_session,
    set_request_audit_state,
)
from valora_backend.config import Settings
from valora_backend.db import get_session
from valora_backend.model.identity import (
    Account,
    Item,
    Kind,
    Location,
    Member,
    Scope,
    Tenant,
)
from valora_backend.model.rules import Action as ScopeAction, Field as ScopeField
from valora_backend.model.log import Log
from valora_backend.model.null_if_empty import commit_session_with_null_if_empty
from valora_backend.locale.member_invite_email import resolve_member_invite_locale
from valora_backend.services.email_service import send_member_invite

router = APIRouter(prefix="/auth", tags=["auth"])

ACTIVE_STATUS = 1
PENDING_STATUS = 2
DISABLED_STATUS = 3
GOOGLE_PROVIDER = "google"
HISTORY_TABLE_NAME_SET = {
    "tenant",
    "member",
    "scope",
    "location",
    "item",
    "field",
    "action",
    "event",
}
HISTORY_ACTION_TYPE_SET = {"I", "U", "D"}
DEFAULT_HISTORY_PAGE_SIZE = 5
MAX_HISTORY_PAGE_SIZE = 50


def _normalize_expression_for_search(value: Any):
    return func.lower(func.unaccent(value))


def _query_term_expression_for_search(raw_value: str | None):
    if raw_value is None:
        return None
    value = raw_value.strip()
    if not value:
        return None
    return _normalize_expression_for_search(literal(value))


class GoogleTokenRequest(BaseModel):
    id_token: str
    remember_me: bool = False


class SelectTenantRequest(BaseModel):
    tenant_id: int
    remember_me: bool = False


class GoogleSelectTenantRequest(SelectTenantRequest):
    id_token: str


class TenantOption(BaseModel):
    tenant_id: int
    name: str
    display_name: str
    role: int


class InviteOption(BaseModel):
    member_id: int
    tenant_id: int
    name: str
    display_name: str
    role: int
    status: str


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    requires_tenant_selection: bool = False
    next_action: str | None = None
    tenant_list: list[TenantOption] = Field(default_factory=list)
    invite_list: list[InviteOption] = Field(default_factory=list)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TenantListResponse(BaseModel):
    tenant_list: list[TenantOption] = Field(default_factory=list)
    invite_list: list[InviteOption] = Field(default_factory=list)


class InviteActionResponse(BaseModel):
    member_id: int
    tenant_id: int
    status: str


class SessionAccount(BaseModel):
    id: int
    email: str
    name: str
    display_name: str
    provider: str


class SessionMember(BaseModel):
    id: int
    role: int
    status: str
    name: str | None
    display_name: str | None
    email: str
    current_scope_id: int | None


class SessionTenant(BaseModel):
    id: int
    name: str
    display_name: str


class TenantCurrentResponse(BaseModel):
    id: int
    name: str
    display_name: str
    can_edit: bool
    can_delete: bool


class TenantDeleteResponse(BaseModel):
    deleted_tenant_id: int


class TenantUpdateRequest(BaseModel):
    name: str
    display_name: str

    @field_validator("name", "display_name")
    @classmethod
    def strip_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class TenantMemberRecord(BaseModel):
    id: int
    name: str | None
    display_name: str | None
    email: str
    role: int
    role_name: str
    status: str
    account_id: int | None
    can_edit: bool
    can_edit_access: bool
    can_delete: bool


class TenantMemberDirectoryResponse(BaseModel):
    can_edit: bool
    can_create: bool
    item_list: list[TenantMemberRecord] = Field(default_factory=list)


class TenantMemberInviteEmailResponse(BaseModel):
    message: str
    email: str


class TenantMemberCreateRequest(BaseModel):
    email: str
    name: str
    display_name: str

    @field_validator("email")
    @classmethod
    def normalize_member_invite_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned or "@" not in cleaned:
            raise ValueError("invalid email")
        return cleaned

    @field_validator("name", "display_name")
    @classmethod
    def strip_optional_invite_name(cls, value: str) -> str:
        return value.strip()


class TenantMemberUpdateRequest(BaseModel):
    email: str
    name: str
    display_name: str
    role: int
    status: int

    @field_validator("email")
    @classmethod
    def normalize_member_update_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned or "@" not in cleaned:
            raise ValueError("invalid email")
        return cleaned

    @field_validator("name", "display_name")
    @classmethod
    def strip_optional_member_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: int) -> int:
        if value not in (MASTER_ROLE, ADMIN_ROLE, MEMBER_ROLE):
            raise ValueError("invalid member role")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: int) -> int:
        if value not in (ACTIVE_STATUS, PENDING_STATUS, DISABLED_STATUS):
            raise ValueError("invalid member status")
        return value


class TenantScopeRecord(BaseModel):
    id: int
    name: str
    display_name: str
    can_edit: bool
    can_delete: bool


class TenantScopeDirectoryResponse(BaseModel):
    can_edit: bool
    can_create: bool
    current_scope_id: int | None = None
    item_list: list[TenantScopeRecord] = Field(default_factory=list)


class TenantScopeUpsertRequest(BaseModel):
    name: str
    display_name: str

    @field_validator("name", "display_name")
    @classmethod
    def strip_non_empty_scope_value(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class CurrentScopeSelectionRequest(BaseModel):
    scope_id: int

    @field_validator("scope_id")
    @classmethod
    def validate_scope_id(cls, value: int) -> int:
        if value < 1:
            raise ValueError("invalid scope id")
        return value


class CurrentScopeSelectionResponse(BaseModel):
    current_scope_id: int | None


class TenantLocationRecord(BaseModel):
    id: int
    parent_location_id: int | None
    name: str
    display_name: str
    sort_order: int
    depth: int
    path_labels: list[str] = Field(default_factory=list)
    children_count: int
    descendants_count: int
    can_edit: bool
    can_delete: bool
    can_create_child: bool
    can_move: bool


class TenantLocationDirectoryResponse(BaseModel):
    scope_id: int
    scope_name: str
    scope_display_name: str
    can_edit: bool
    can_create: bool
    item_list: list[TenantLocationRecord] = Field(default_factory=list)


class TenantLocationUpsertRequest(BaseModel):
    name: str
    display_name: str
    parent_location_id: int | None = None

    @field_validator("name", "display_name")
    @classmethod
    def strip_non_empty_location_value(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("parent_location_id")
    @classmethod
    def validate_parent_location_id(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("invalid parent location id")
        return value


class TenantLocationMoveRequest(BaseModel):
    parent_location_id: int | None = None
    target_index: int = 0

    @field_validator("parent_location_id")
    @classmethod
    def validate_move_parent_location_id(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("invalid parent location id")
        return value

    @field_validator("target_index")
    @classmethod
    def validate_target_index(cls, value: int) -> int:
        if value < 0:
            raise ValueError("target index must be non-negative")
        return value


class TenantKindRecord(BaseModel):
    id: int
    name: str
    display_name: str
    reference_count: int


class TenantKindListResponse(BaseModel):
    can_edit: bool
    item_list: list[TenantKindRecord] = Field(default_factory=list)


class TenantKindCreateRequest(BaseModel):
    name: str
    display_name: str

    @field_validator("name", "display_name")
    @classmethod
    def strip_non_empty_kind_value(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class TenantKindPatchRequest(BaseModel):
    name: str | None = None
    display_name: str | None = None

    @field_validator("name", "display_name")
    @classmethod
    def strip_kind_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class TenantItemRecord(BaseModel):
    id: int
    parent_item_id: int | None
    kind_id: int
    name: str
    display_name: str
    sort_order: int
    depth: int
    path_labels: list[str] = Field(default_factory=list)
    children_count: int
    descendants_count: int
    can_edit: bool
    can_delete: bool
    can_create_child: bool
    can_move: bool


class TenantItemDirectoryResponse(BaseModel):
    scope_id: int
    scope_name: str
    scope_display_name: str
    can_edit: bool
    can_create: bool
    kind_list: list[TenantKindRecord] = Field(default_factory=list)
    item_list: list[TenantItemRecord] = Field(default_factory=list)


class TenantItemUpsertRequest(BaseModel):
    kind_id: int
    parent_item_id: int | None = None

    @field_validator("kind_id")
    @classmethod
    def validate_kind_id_value(cls, value: int) -> int:
        if value < 1:
            raise ValueError("invalid kind id")
        return value

    @field_validator("parent_item_id")
    @classmethod
    def validate_parent_item_id(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("invalid parent item id")
        return value


class TenantItemMoveRequest(BaseModel):
    parent_item_id: int | None = None
    target_index: int = 0

    @field_validator("parent_item_id")
    @classmethod
    def validate_move_parent_item_id(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("invalid parent item id")
        return value

    @field_validator("target_index")
    @classmethod
    def validate_item_target_index(cls, value: int) -> int:
        if value < 0:
            raise ValueError("target index must be non-negative")
        return value


class AuthSessionResponse(BaseModel):
    account: SessionAccount
    member: SessionMember
    tenant: SessionTenant


class TenantHistoryDiffFieldResponse(BaseModel):
    field_name: str
    previous_value: Any | None = None
    current_value: Any | None = None


class TenantHistoryRecordResponse(BaseModel):
    id: int
    moment_utc: datetime
    actor_name: str | None = None
    action_type: str
    row_id: int
    row: dict[str, Any] | None = None
    field_change_list: list[TenantHistoryDiffFieldResponse] = Field(
        default_factory=list
    )
    diff_state: str = "not_applicable"


class TenantHistoryResponse(BaseModel):
    item_list: list[TenantHistoryRecordResponse] = Field(default_factory=list)
    has_more: bool
    next_offset: int | None = None


def _sync_account_name(account: Account, identity: GoogleIdentity) -> bool:
    name, display_name = build_account_name(identity.name, identity.email)
    changed = False

    if account.name != name:
        account.name = name
        changed = True

    if account.display_name != display_name:
        account.display_name = display_name
        changed = True

    if account.email != identity.email:
        account.email = identity.email
        changed = True

    if account.provider != GOOGLE_PROVIDER:
        account.provider = GOOGLE_PROVIDER
        changed = True

    if account.provider_subject != identity.provider_subject:
        account.provider_subject = identity.provider_subject
        changed = True

    return changed


def _preallocate_bigint_pk_if_postgresql(
    session: Session, *, table_name: str
) -> int | None:
    """Reserva o próximo valor do sequence em PostgreSQL para auditar INSERT com contexto."""
    bind = session.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return None
    return int(
        session.execute(
            text("SELECT nextval(pg_get_serial_sequence(:table_name, 'id'))"),
            {"table_name": table_name},
        ).scalar_one()
    )


def _apply_member_audit_context(session: Session, actor: Member) -> None:
    """Reforca o contexto de auditoria na mesma sessao usada pela mutacao."""
    apply_audit_gucs_for_session(session, actor.tenant_id, actor.account_id)


def _find_or_create_account(
    session: Session,
    identity: GoogleIdentity,
    request: Request | None = None,
) -> Account:
    account = session.scalar(
        select(Account).where(
            Account.provider == GOOGLE_PROVIDER,
            Account.provider_subject == identity.provider_subject,
        )
    )
    if not account:
        account = session.scalar(select(Account).where(Account.email == identity.email))

    if account:
        if request is not None:
            set_request_audit_state(request, tenant_id=None, account_id=account.id)
        if _sync_account_name(account, identity):
            session.add(account)
            apply_audit_gucs_for_session(session, None, account.id)
            commit_session_with_null_if_empty(session)
            session.refresh(account)
        return account

    name, display_name = build_account_name(identity.name, identity.email)
    account = Account(
        id=_preallocate_bigint_pk_if_postgresql(session, table_name="account"),
        name=name,
        display_name=display_name,
        email=identity.email,
        provider=GOOGLE_PROVIDER,
        provider_subject=identity.provider_subject,
    )
    session.add(account)
    if account.id is None:
        session.flush()
    if request is not None:
        set_request_audit_state(request, tenant_id=None, account_id=account.id)
    apply_audit_gucs_for_session(session, None, account.id)
    commit_session_with_null_if_empty(session)
    session.refresh(account)
    return account


def _sync_member_identity(member: Member, account: Account) -> bool:
    changed = False

    if member.account_id != account.id:
        member.account_id = account.id
        changed = True

    if not member.name:
        member.name = account.name
        changed = True

    if not member.display_name:
        member.display_name = account.display_name
        changed = True

    # Email do vínculo (convite / identificação) é editável na API; não espelhar account.email após o vínculo.

    return changed


def _link_pending_member_to_account(
    session: Session,
    account: Account,
    request: Request | None = None,
) -> None:
    pending_member_list = session.scalars(
        select(Member).where(
            Member.email == account.email,
            Member.account_id.is_(None),
            Member.status == PENDING_STATUS,
        )
    ).all()

    for pending_member in pending_member_list:
        if request is not None:
            set_request_audit_state(
                request,
                tenant_id=pending_member.tenant_id,
                account_id=account.id,
            )
        if _sync_member_identity(pending_member, account):
            session.add(pending_member)
            apply_audit_gucs_for_session(session, pending_member.tenant_id, account.id)
            commit_session_with_null_if_empty(session)


def _list_active_tenant_option_list(
    session: Session,
    *,
    account_id: int,
) -> list[TenantOption]:
    row_list = session.execute(
        select(Tenant, Member)
        .join(Member, Member.tenant_id == Tenant.id)
        .where(
            Member.account_id == account_id,
            Member.status == ACTIVE_STATUS,
        )
        .order_by(Tenant.id.asc())
    ).all()

    tenant_option_list: list[TenantOption] = []
    for tenant, member in row_list:
        tenant_option_list.append(
            TenantOption(
                tenant_id=tenant.id,
                name=tenant.name,
                display_name=tenant_display_name(tenant),
                role=member.role,
            )
        )

    return tenant_option_list


def _list_pending_invite_option_list(
    session: Session,
    *,
    account: Account,
) -> list[InviteOption]:
    row_list = session.execute(
        select(Tenant, Member)
        .join(Member, Member.tenant_id == Tenant.id)
        .where(
            Member.status == PENDING_STATUS,
            or_(
                Member.account_id == account.id,
                (Member.account_id.is_(None) & (Member.email == account.email)),
            ),
        )
        .order_by(Tenant.id.asc())
    ).all()

    invite_option_list: list[InviteOption] = []
    for tenant, member in row_list:
        invite_option_list.append(
            InviteOption(
                member_id=member.id,
                tenant_id=tenant.id,
                name=tenant.name,
                display_name=tenant_display_name(tenant),
                role=member.role,
                status=member_status_name(member.status),
            )
        )

    return invite_option_list


def _get_account_context_option_list(
    session: Session,
    *,
    account: Account,
) -> tuple[list[TenantOption], list[InviteOption]]:
    tenant_option_list = _list_active_tenant_option_list(session, account_id=account.id)
    invite_option_list = _list_pending_invite_option_list(session, account=account)
    return tenant_option_list, invite_option_list


def _get_active_member(
    session: Session,
    *,
    account_id: int,
    tenant_id: int,
) -> Member | None:
    return session.scalar(
        select(Member).where(
            Member.account_id == account_id,
            Member.tenant_id == tenant_id,
            Member.status == ACTIVE_STATUS,
        )
    )


def _get_pending_member(
    session: Session,
    *,
    account: Account,
    tenant_id: int,
) -> Member | None:
    return session.scalar(
        select(Member).where(
            or_(
                Member.account_id == account.id,
                (Member.account_id.is_(None) & (Member.email == account.email)),
            ),
            Member.tenant_id == tenant_id,
            Member.status == PENDING_STATUS,
        )
    )


def _issue_token_for_member(
    member: Member, *, account_id: int, remember_me: bool = False
) -> str:
    return create_access_token(
        account_id=account_id,
        tenant_id=member.tenant_id,
        remember_me=remember_me,
    )


def _create_initial_tenant_member(
    session: Session, account: Account, request: Request
) -> Member:
    # Rotas só com id_token não têm JWT: request.state estava vazio e o before_flush
    # reaplicava GUCs vazias antes do flush, quebrando o trigger (INSERT tenant exige account_id).
    #
    # Auditoria (valora_audit_row_to_log): o INSERT em `log` usa account_id/tenant_id das GUCs
    # (não o JSON da linha) para as FKs em log.account_id / log.tenant_id. No INSERT em
    # `tenant`, a política do trigger permite tenant_id NULL no log; account_id tem de
    # apontar para uma conta já persistida (a de _find_or_create_account). No INSERT em
    # `member`, ambas as GUCs têm de existir em `tenant` e `account`, daí o primeiro
    # commit só do tenant e só depois o membro, com set_request_audit_state atualizado.
    set_request_audit_state(request, tenant_id=None, account_id=account.id)
    tenant = Tenant(
        id=_preallocate_bigint_pk_if_postgresql(session, table_name="tenant"),
        name=account.display_name,
        display_name=account.display_name,
    )
    session.add(tenant)
    if tenant.id is None:
        session.flush()
    apply_audit_gucs_for_session(session, tenant.id, account.id)
    commit_session_with_null_if_empty(session)
    session.refresh(tenant)

    set_request_audit_state(request, tenant_id=tenant.id, account_id=account.id)
    member = Member(
        name=account.name,
        display_name=account.display_name,
        email=account.email,
        tenant_id=tenant.id,
        account_id=account.id,
        role=MASTER_ROLE,
        status=ACTIVE_STATUS,
    )
    session.add(member)
    apply_audit_gucs_for_session(session, tenant.id, account.id)
    commit_session_with_null_if_empty(session)
    session.refresh(member)
    return member


def _resolve_member_for_access(
    session: Session,
    *,
    account: Account,
    tenant_id: int,
) -> Member:
    member = _get_active_member(
        session,
        account_id=account.id,
        tenant_id=tenant_id,
    )
    if member:
        return member

    pending_member = _get_pending_member(
        session,
        account=account,
        tenant_id=tenant_id,
    )
    if not pending_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied for selected tenant",
        )

    if _sync_member_identity(pending_member, account):
        session.add(pending_member)
        apply_audit_gucs_for_session(session, pending_member.tenant_id, account.id)
        commit_session_with_null_if_empty(session)
        session.refresh(pending_member)

    return pending_member


@router.post("/google", response_model=AuthResponse)
def auth_google(
    request: Request,
    body: GoogleTokenRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity, request)
    _link_pending_member_to_account(session, account, request)

    tenant_option_list, invite_option_list = _get_account_context_option_list(
        session,
        account=account,
    )
    decision = decide_login_action(
        active_count=len(tenant_option_list),
        pending_count=len(invite_option_list),
    )

    if decision.action == LoginAction.CREATE_TENANT:
        return AuthResponse(
            requires_tenant_selection=True,
            next_action=decision.action.value,
        )

    if decision.action == LoginAction.SELECT_TENANT:
        return AuthResponse(
            requires_tenant_selection=True,
            next_action=decision.action.value,
            tenant_list=tenant_option_list,
            invite_list=invite_option_list,
        )

    selected_tenant = tenant_option_list[0]
    member = _get_active_member(
        session,
        account_id=account.id,
        tenant_id=selected_tenant.tenant_id,
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active member not found for selected tenant",
        )

    if _sync_member_identity(member, account):
        set_request_audit_state(
            request, tenant_id=member.tenant_id, account_id=account.id
        )
        session.add(member)
        apply_audit_gucs_for_session(session, member.tenant_id, account.id)
        commit_session_with_null_if_empty(session)
        session.refresh(member)

    return AuthResponse(
        access_token=_issue_token_for_member(
            member, account_id=account.id, remember_me=body.remember_me
        ),
        next_action=decision.action.value,
    )


@router.post("/google/select-tenant", response_model=TokenResponse)
def auth_google_select_tenant(
    request: Request,
    body: GoogleSelectTenantRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity, request)
    _link_pending_member_to_account(session, account, request)
    set_request_audit_state(request, tenant_id=body.tenant_id, account_id=account.id)

    member = _resolve_member_for_access(
        session,
        account=account,
        tenant_id=body.tenant_id,
    )
    return TokenResponse(
        access_token=_issue_token_for_member(
            member, account_id=account.id, remember_me=body.remember_me
        )
    )


@router.post("/google/create-tenant", response_model=TokenResponse)
def auth_google_create_tenant(
    request: Request,
    body: GoogleTokenRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity, request)
    _link_pending_member_to_account(session, account, request)

    tenant_option_list, invite_option_list = _get_account_context_option_list(
        session,
        account=account,
    )
    if tenant_option_list or invite_option_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account already has tenant access or pending invite",
        )

    member = _create_initial_tenant_member(session, account, request)
    return TokenResponse(
        access_token=_issue_token_for_member(
            member, account_id=account.id, remember_me=body.remember_me
        )
    )


@router.post("/switch-tenant", response_model=TokenResponse)
def switch_tenant(
    body: SelectTenantRequest,
    account: Account = Depends(get_current_account),
    session: Session = Depends(get_session),
):
    member = _resolve_member_for_access(
        session,
        account=account,
        tenant_id=body.tenant_id,
    )
    return TokenResponse(
        access_token=_issue_token_for_member(
            member, account_id=account.id, remember_me=body.remember_me
        )
    )


@router.get("/tenant/list", response_model=TenantListResponse)
def list_my_tenant(
    account: Account = Depends(get_current_account),
    session: Session = Depends(get_session),
):
    tenant_option_list, invite_option_list = _get_account_context_option_list(
        session,
        account=account,
    )
    return TenantListResponse(
        tenant_list=tenant_option_list,
        invite_list=invite_option_list,
    )


def _member_can_edit_tenant(member: Member) -> bool:
    return member.role in (MASTER_ROLE, ADMIN_ROLE)


def _member_invite_http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _invite_email_locale_from_request(request: Request) -> str:
    header_locale = request.headers.get("x-valora-invite-email-locale")
    if header_locale and header_locale.strip():
        return resolve_member_invite_locale(header_locale.strip())
    return resolve_member_invite_locale(Settings().invite_email_locale)


def _member_can_delete_tenant(member: Member) -> bool:
    return member.role == MASTER_ROLE


def _member_can_edit_member_profile(actor: Member, target: Member) -> bool:
    if actor.role == MASTER_ROLE:
        return True

    if actor.role == ADMIN_ROLE:
        return target.role != MASTER_ROLE

    return False


def _member_can_edit_member_access(actor: Member, target: Member) -> bool:
    return actor.role == MASTER_ROLE and actor.id != target.id


def _member_can_delete_member(actor: Member, target: Member) -> bool:
    return actor.role == MASTER_ROLE and actor.id != target.id


def _member_can_edit_scope(member: Member) -> bool:
    return member.role in (MASTER_ROLE, ADMIN_ROLE)


def _member_can_delete_scope(member: Member) -> bool:
    return member.role in (MASTER_ROLE, ADMIN_ROLE)


def _member_can_edit_scope_hierarchy_directory(member: Member) -> bool:
    """Permissão para editar árvores hierárquicas por escopo (ex.: location, item)."""
    return _member_can_edit_scope(member)


def _member_can_delete_scope_hierarchy_directory(member: Member) -> bool:
    """Permissão para apagar nós em árvores hierárquicas por escopo (ex.: location, item)."""
    return _member_can_delete_scope(member)


def _serialize_tenant_member(actor: Member, target: Member) -> TenantMemberRecord:
    return TenantMemberRecord(
        id=target.id,
        name=target.name,
        display_name=target.display_name,
        email=target.email,
        role=target.role,
        role_name=member_role_name(target.role),
        status=member_status_name(target.status),
        account_id=target.account_id,
        can_edit=_member_can_edit_member_profile(actor, target),
        can_edit_access=_member_can_edit_member_access(actor, target),
        can_delete=_member_can_delete_member(actor, target),
    )


def _serialize_tenant_scope(actor: Member, target: Scope) -> TenantScopeRecord:
    can_edit_scope = _member_can_edit_scope(actor)
    return TenantScopeRecord(
        id=target.id,
        name=target.name,
        display_name=target.display_name,
        can_edit=can_edit_scope,
        can_delete=_member_can_delete_scope(actor),
    )


def _resolve_member_current_scope_id(
    session: Session,
    *,
    actor: Member,
) -> int | None:
    if actor.current_scope_id is None:
        return None

    selected_scope = session.get(Scope, actor.current_scope_id)
    if not selected_scope or selected_scope.tenant_id != actor.tenant_id:
        return None

    return selected_scope.id


def _parse_query_name_list(raw_value: str | None) -> list[str] | None:
    if raw_value is None:
        return None
    return [item.strip().lower() for item in raw_value.split(",") if item.strip()]


def _build_tenant_member_directory(
    session: Session,
    *,
    actor: Member,
    q: str | None = None,
    role: str | None = None,
    status_name: str | None = None,
    role_name_list: list[str] | None = None,
    status_name_list: list[str] | None = None,
) -> TenantMemberDirectoryResponse:
    query = select(Member).where(Member.tenant_id == actor.tenant_id)
    role_map = {
        "master": MASTER_ROLE,
        "admin": ADMIN_ROLE,
        "member": MEMBER_ROLE,
    }
    if role_name_list is not None:
        role_value_list = sorted(
            {role_map[item] for item in role_name_list if item in role_map}
        )
        if not role_value_list:
            query = query.where(text("1=0"))
        else:
            query = query.where(Member.role.in_(role_value_list))
    elif role:
        normalized_role = role.strip().lower()
        role_value = role_map.get(normalized_role)
        if role_value is not None:
            query = query.where(Member.role == role_value)

    status_map = {
        "active": ACTIVE_STATUS,
        "pending": PENDING_STATUS,
        "disabled": DISABLED_STATUS,
    }
    if status_name_list is not None:
        status_value_list = sorted(
            {status_map[item] for item in status_name_list if item in status_map}
        )
        if not status_value_list:
            query = query.where(text("1=0"))
        else:
            query = query.where(Member.status.in_(status_value_list))
    elif status_name:
        normalized_status = status_name.strip().lower()
        status_value = status_map.get(normalized_status)
        if status_value is not None:
            query = query.where(Member.status == status_value)

    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
            query = query.where(
                or_(
                    _normalize_expression_for_search(Member.name).contains(query_term_expression),
                    _normalize_expression_for_search(Member.display_name).contains(
                        query_term_expression
                    ),
                    _normalize_expression_for_search(Member.email).contains(query_term_expression),
                )
            )

    member_list = list(session.scalars(query))
    member_list.sort(
        key=lambda item: (
            item.role,
            item.status,
            member_display_name(item).lower(),
            item.email.lower(),
            item.id,
        )
    )
    can_manage_directory = _member_can_edit_tenant(actor)
    return TenantMemberDirectoryResponse(
        can_edit=can_manage_directory,
        can_create=can_manage_directory,
        item_list=[_serialize_tenant_member(actor, item) for item in member_list],
    )


def _build_tenant_scope_directory(
    session: Session, *, actor: Member, q: str | None = None
) -> TenantScopeDirectoryResponse:
    query = select(Scope).where(Scope.tenant_id == actor.tenant_id)
    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
            query = query.where(
                or_(
                    _normalize_expression_for_search(Scope.name).contains(query_term_expression),
                    _normalize_expression_for_search(Scope.display_name).contains(
                        query_term_expression
                    ),
                )
            )

    scope_list = list(session.scalars(query))
    scope_list.sort(
        key=lambda item: (item.name.lower(), item.display_name.lower(), item.id)
    )
    return TenantScopeDirectoryResponse(
        can_edit=_member_can_edit_scope(actor),
        can_create=_member_can_edit_scope(actor),
        current_scope_id=_resolve_member_current_scope_id(session, actor=actor),
        item_list=[_serialize_tenant_scope(actor, item) for item in scope_list],
    )


def _get_tenant_scope_for_location(
    session: Session, *, actor: Member, scope_id: int
) -> Scope:
    target_scope = session.get(Scope, scope_id)
    if not target_scope or target_scope.tenant_id != actor.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scope not found for current tenant",
        )

    return target_scope


def _get_scope_location_list(
    session: Session,
    *,
    scope_id: int,
    q: str | None = None,
    parent_location_id: int | None = None,
) -> list[Location]:
    query = select(Location).where(Location.scope_id == scope_id)
    if parent_location_id is not None:
        query = query.where(Location.parent_location_id == parent_location_id)

    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
            query = query.where(
                or_(
                    _normalize_expression_for_search(Location.name).contains(query_term_expression),
                    _normalize_expression_for_search(Location.display_name).contains(
                        query_term_expression
                    ),
                )
            )

    return list(
        session.scalars(query.order_by(Location.sort_order, Location.name, Location.id))
    )


def _include_hierarchy_ancestor_chain_for_filter(
    *,
    filtered_item_list: list[Any],
    full_item_list: list[Any],
    get_id: Callable[[Any], int],
    get_parent_id: Callable[[Any], int | None],
) -> list[Any]:
    if not filtered_item_list:
        return []

    item_by_id = {get_id(item): item for item in full_item_list}
    selected_id_set: set[int] = set()

    for item in filtered_item_list:
        current = item
        while current is not None:
            current_id = get_id(current)
            if current_id in selected_id_set:
                break

            selected_id_set.add(current_id)
            parent_id = get_parent_id(current)
            if parent_id is None:
                break

            current = item_by_id.get(parent_id)

    return [
        item
        for item in sorted(full_item_list, key=hierarchy_sort_key)
        if get_id(item) in selected_id_set
    ]


def _get_scope_location_or_404(
    session: Session, *, scope_id: int, location_id: int
) -> Location:
    target_location = session.get(Location, location_id)
    if not target_location or target_location.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found for current scope",
        )

    return target_location


def _validate_location_parent_change(
    location_map: dict[int, Location],
    *,
    parent_location_id: int | None,
    moving_location_id: int | None,
) -> None:
    validate_scope_hierarchy_parent_change(
        location_map,
        get_parent_id=lambda item: item.parent_location_id,
        parent_id=parent_location_id,
        moving_id=moving_location_id,
        not_found_detail="Parent location not found for current scope",
        self_parent_detail="Location cannot be its own parent",
        cycle_detail="Location cannot move under one of its descendants",
    )


def _validate_item_parent_change(
    item_map: dict[int, Item],
    *,
    parent_item_id: int | None,
    moving_item_id: int | None,
) -> None:
    validate_scope_hierarchy_parent_change(
        item_map,
        get_parent_id=lambda row: row.parent_item_id,
        parent_id=parent_item_id,
        moving_id=moving_item_id,
        not_found_detail="Parent item not found for current scope",
        self_parent_detail="Item cannot be its own parent",
        cycle_detail="Item cannot move under one of its descendants",
    )


def _move_location_in_scope(
    session: Session,
    *,
    target_location: Location,
    parent_location_id: int | None,
    target_index: int | None,
) -> None:
    location_list = _get_scope_location_list(session, scope_id=target_location.scope_id)
    move_hierarchy_node_in_scope(
        session,
        item_list=location_list,
        target_item=target_location,
        get_parent_id=lambda item: item.parent_location_id,
        set_parent_id=lambda item, value: setattr(item, "parent_location_id", value),
        new_parent_id=parent_location_id,
        target_index=target_index,
        not_found_detail="Parent location not found for current scope",
        self_parent_detail="Location cannot be its own parent",
        cycle_detail="Location cannot move under one of its descendants",
    )


def _normalize_scope_location_order(session: Session, *, scope_id: int) -> None:
    location_list = _get_scope_location_list(session, scope_id=scope_id)
    normalize_scope_hierarchy_order(
        session,
        item_list=location_list,
        get_parent_id=lambda item: item.parent_location_id,
    )


def _build_tenant_location_directory(
    session: Session,
    *,
    actor: Member,
    scope: Scope,
    q: str | None = None,
    parent_location_id: int | None = None,
) -> TenantLocationDirectoryResponse:
    location_list = _get_scope_location_list(
        session,
        scope_id=scope.id,
        q=q,
        parent_location_id=parent_location_id,
    )
    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None and parent_location_id is None:
        full_location_list = _get_scope_location_list(session, scope_id=scope.id)
        location_list = _include_hierarchy_ancestor_chain_for_filter(
            filtered_item_list=location_list,
            full_item_list=full_location_list,
            get_id=lambda item: item.id,
            get_parent_id=lambda item: item.parent_location_id,
        )

    child_list_by_parent_id: defaultdict[int | None, list[Location]] = defaultdict(list)
    for item in sorted(location_list, key=hierarchy_sort_key):
        child_list_by_parent_id[item.parent_location_id].append(item)

    item_list: list[TenantLocationRecord] = []
    visited_location_id_set: set[int] = set()
    can_edit_hierarchy = _member_can_edit_scope_hierarchy_directory(actor)

    def append_branch(location: Location, *, depth: int, path_prefix: list[str]) -> int:
        visited_location_id_set.add(location.id)
        path_labels = [*path_prefix, hierarchy_item_label(location)]
        child_list = child_list_by_parent_id.get(location.id, [])
        record = TenantLocationRecord(
            id=location.id,
            parent_location_id=location.parent_location_id,
            name=location.name,
            display_name=location.display_name,
            sort_order=location.sort_order,
            depth=depth,
            path_labels=path_labels,
            children_count=len(child_list),
            descendants_count=0,
            can_edit=can_edit_hierarchy,
            can_delete=_member_can_delete_scope_hierarchy_directory(actor),
            can_create_child=can_edit_hierarchy,
            can_move=can_edit_hierarchy,
        )
        item_list.append(record)

        descendant_count = 0
        for child in child_list:
            descendant_count += 1 + append_branch(
                child,
                depth=depth + 1,
                path_prefix=path_labels,
            )

        record.descendants_count = descendant_count
        return descendant_count

    for root_location in child_list_by_parent_id.get(None, []):
        append_branch(root_location, depth=0, path_prefix=[])

    for dangling_location in sorted(location_list, key=hierarchy_sort_key):
        if dangling_location.id not in visited_location_id_set:
            append_branch(dangling_location, depth=0, path_prefix=[])

    return TenantLocationDirectoryResponse(
        scope_id=scope.id,
        scope_name=scope.name,
        scope_display_name=scope.display_name,
        can_edit=can_edit_hierarchy,
        can_create=can_edit_hierarchy,
        item_list=item_list,
    )


def _get_scope_item_list(
    session: Session,
    *,
    scope_id: int,
    q: str | None = None,
    parent_item_id: int | None = None,
) -> list[Item]:
    query = (
        select(Item)
        .join(Kind, Item.kind_id == Kind.id)
        .where(Item.scope_id == scope_id)
        .options(contains_eager(Item.kind))
    )
    if parent_item_id is not None:
        query = query.where(Item.parent_item_id == parent_item_id)

    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
        query = query.where(
            or_(
                _normalize_expression_for_search(Kind.name).contains(
                    query_term_expression
                ),
                _normalize_expression_for_search(Kind.display_name).contains(
                    query_term_expression
                ),
            )
        )

    return list(
        session.scalars(query.order_by(Item.sort_order, Kind.name, Item.id))
    )


def _get_scope_item_or_404(session: Session, *, scope_id: int, item_id: int) -> Item:
    target_item = session.scalar(
        select(Item)
        .where(Item.id == item_id, Item.scope_id == scope_id)
        .options(joinedload(Item.kind))
    )
    if not target_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found for current scope",
        )

    return target_item


def _get_scope_kind_or_404(
    session: Session, *, scope_id: int, kind_id: int
) -> Kind:
    row = session.get(Kind, kind_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kind not found for current scope",
        )
    return row


def _tenant_kind_record_list_for_scope(
    session: Session, *, scope_id: int
) -> list[TenantKindRecord]:
    rows = session.execute(
        select(Kind, func.count(Item.id))
        .outerjoin(Item, Item.kind_id == Kind.id)
        .where(Kind.scope_id == scope_id)
        .group_by(Kind)
        .order_by(Kind.name, Kind.id)
    ).all()
    return [
        TenantKindRecord(
            id=kind.id,
            name=kind.name,
            display_name=kind.display_name,
            reference_count=int(ref_count),
        )
        for kind, ref_count in rows
    ]


def _move_item_in_scope(
    session: Session,
    *,
    target_item: Item,
    parent_item_id: int | None,
    target_index: int | None,
) -> None:
    item_row_list = _get_scope_item_list(session, scope_id=target_item.scope_id)
    move_hierarchy_node_in_scope(
        session,
        item_list=item_row_list,
        target_item=target_item,
        get_parent_id=lambda row: row.parent_item_id,
        set_parent_id=lambda row, value: setattr(row, "parent_item_id", value),
        new_parent_id=parent_item_id,
        target_index=target_index,
        not_found_detail="Parent item not found for current scope",
        self_parent_detail="Item cannot be its own parent",
        cycle_detail="Item cannot move under one of its descendants",
    )


def _normalize_scope_item_order(session: Session, *, scope_id: int) -> None:
    item_row_list = _get_scope_item_list(session, scope_id=scope_id)
    normalize_scope_hierarchy_order(
        session,
        item_list=item_row_list,
        get_parent_id=lambda row: row.parent_item_id,
    )


def _build_tenant_item_directory(
    session: Session,
    *,
    actor: Member,
    scope: Scope,
    q: str | None = None,
    parent_item_id: int | None = None,
) -> TenantItemDirectoryResponse:
    item_row_list = _get_scope_item_list(
        session,
        scope_id=scope.id,
        q=q,
        parent_item_id=parent_item_id,
    )
    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None and parent_item_id is None:
        full_item_list = _get_scope_item_list(session, scope_id=scope.id)
        item_row_list = _include_hierarchy_ancestor_chain_for_filter(
            filtered_item_list=item_row_list,
            full_item_list=full_item_list,
            get_id=lambda row: row.id,
            get_parent_id=lambda row: row.parent_item_id,
        )

    child_list_by_parent_id: defaultdict[int | None, list[Item]] = defaultdict(list)
    for row in sorted(item_row_list, key=hierarchy_sort_key):
        child_list_by_parent_id[row.parent_item_id].append(row)

    out_list: list[TenantItemRecord] = []
    visited_item_id_set: set[int] = set()
    can_edit_hierarchy = _member_can_edit_scope_hierarchy_directory(actor)

    def append_branch(item_row: Item, *, depth: int, path_prefix: list[str]) -> int:
        visited_item_id_set.add(item_row.id)
        path_labels = [*path_prefix, hierarchy_item_label(item_row)]
        child_list = child_list_by_parent_id.get(item_row.id, [])
        record = TenantItemRecord(
            id=item_row.id,
            parent_item_id=item_row.parent_item_id,
            kind_id=item_row.kind_id,
            name=item_row.kind.name,
            display_name=item_row.kind.display_name,
            sort_order=item_row.sort_order,
            depth=depth,
            path_labels=path_labels,
            children_count=len(child_list),
            descendants_count=0,
            can_edit=can_edit_hierarchy,
            can_delete=_member_can_delete_scope_hierarchy_directory(actor),
            can_create_child=can_edit_hierarchy,
            can_move=can_edit_hierarchy,
        )
        out_list.append(record)

        descendant_count = 0
        for child in child_list:
            descendant_count += 1 + append_branch(
                child,
                depth=depth + 1,
                path_prefix=path_labels,
            )

        record.descendants_count = descendant_count
        return descendant_count

    for root_item in child_list_by_parent_id.get(None, []):
        append_branch(root_item, depth=0, path_prefix=[])

    for dangling_item in sorted(item_row_list, key=hierarchy_sort_key):
        if dangling_item.id not in visited_item_id_set:
            append_branch(dangling_item, depth=0, path_prefix=[])

    kind_list = _tenant_kind_record_list_for_scope(session, scope_id=scope.id)
    return TenantItemDirectoryResponse(
        scope_id=scope.id,
        scope_name=scope.name,
        scope_display_name=scope.display_name,
        can_edit=can_edit_hierarchy,
        can_create=can_edit_hierarchy,
        kind_list=kind_list,
        item_list=out_list,
    )


def _validate_member_status_transition(target: Member, next_status: int) -> None:
    if target.account_id is None and next_status == ACTIVE_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending members without a linked account cannot become active",
        )

    if target.account_id is not None and next_status == PENDING_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linked members cannot return to pending status",
        )


def _validate_history_table_name(table_name: str) -> str:
    """Nomes canônicos em minúsculas; o path da URL pode variar o casing."""
    normalized = table_name.strip().lower()
    if normalized not in HISTORY_TABLE_NAME_SET:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History table not found",
        )
    return normalized


def _resolve_history_actor_name(
    *,
    display_name: str | None,
    name: str | None,
    email: str | None,
) -> str | None:
    for candidate in (display_name, name, email):
        if candidate and candidate.strip():
            return candidate.strip()
    return None


def _coerce_log_row_payload_dict(value: Any) -> dict[str, Any] | None:
    """Normaliza o payload JSON da coluna log.row para dict (drivers / legado)."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed: Any = json.loads(value)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _build_history_field_change_list(
    *,
    current_row: dict[str, Any] | None,
    previous_row: dict[str, Any] | None,
) -> list[TenantHistoryDiffFieldResponse]:
    if current_row is None or previous_row is None:
        return []

    return [
        TenantHistoryDiffFieldResponse(
            field_name=field_name,
            previous_value=previous_row.get(field_name),
            current_value=current_row.get(field_name),
        )
        for field_name in sorted(set(previous_row) | set(current_row))
        if previous_row.get(field_name) != current_row.get(field_name)
    ]


def _build_previous_row_payload_by_log_id(
    session: Session,
    *,
    table_name: str,
    tenant_id: int,
    page_row_list: list[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    pending_lookup_by_record_id: dict[int, list[dict[str, int]]] = defaultdict(list)
    previous_row_payload_by_log_id: dict[int, dict[str, Any]] = {}
    max_before_id = 0

    for page_row in page_row_list:
        if page_row["action_type"] not in ("U", "D"):
            continue

        record_id = int(page_row["row_id"])

        log_id = int(page_row["id"])
        pending_lookup_by_record_id[record_id].append(
            {"log_id": log_id, "before_id": log_id}
        )
        max_before_id = max(max_before_id, log_id)

    if not pending_lookup_by_record_id:
        return previous_row_payload_by_log_id

    for pending_list in pending_lookup_by_record_id.values():
        pending_list.sort(key=lambda item: item["before_id"], reverse=True)

    record_id_tuple = tuple(pending_lookup_by_record_id.keys())
    prior_query = (
        select(Log)
        .where(
            Log.tenant_id == tenant_id,
            Log.table_name == table_name,
            Log.row_payload.is_not(None),
            Log.id < max_before_id,
            Log.row_id.in_(record_id_tuple),
        )
        .order_by(Log.id.desc())
    )
    prior_log_stream = session.scalars(prior_query)

    for prior_log in prior_log_stream:
        record_id = prior_log.row_id

        pending_list = pending_lookup_by_record_id.get(record_id)
        if not pending_list:
            continue

        while pending_list and prior_log.id < pending_list[0]["before_id"]:
            payload_dict = _coerce_log_row_payload_dict(prior_log.row_payload)
            if payload_dict is not None:
                previous_row_payload_by_log_id[pending_list[0]["log_id"]] = payload_dict
                pending_list.pop(0)
            else:
                break

        if not pending_list:
            pending_lookup_by_record_id.pop(record_id, None)
            if not pending_lookup_by_record_id:
                break

    return previous_row_payload_by_log_id


def _build_tenant_history_response(
    session: Session,
    *,
    actor: Member,
    table_name: str,
    limit: int,
    offset: int,
    action_type: str | None,
    actor_query: str | None,
    moment_from: date | None,
    moment_to: date | None,
) -> TenantHistoryResponse:
    validated_table_name = _validate_history_table_name(table_name)

    if action_type is not None and action_type not in HISTORY_ACTION_TYPE_SET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid history action",
        )

    if moment_from and moment_to and moment_from > moment_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid history period",
        )

    history_query = (
        select(
            Log.id.label("id"),
            Log.moment_utc.label("moment_utc"),
            Log.action_type.label("action_type"),
            Log.row_id.label("row_id"),
            Log.row_payload.label("row_payload"),
            Account.display_name.label("actor_display_name"),
            Account.name.label("actor_name"),
            Account.email.label("actor_email"),
        )
        .select_from(Log)
        .outerjoin(Account, Account.id == Log.account_id)
        .where(
            Log.tenant_id == actor.tenant_id,
            Log.table_name == validated_table_name,
        )
    )

    if action_type is not None:
        history_query = history_query.where(Log.action_type == action_type)

    actor_query_term_expression = _query_term_expression_for_search(actor_query)
    if actor_query_term_expression is not None:
        history_query = history_query.where(
            or_(
                _normalize_expression_for_search(Account.display_name).contains(
                    actor_query_term_expression
                ),
                _normalize_expression_for_search(Account.name).contains(
                    actor_query_term_expression
                ),
                _normalize_expression_for_search(Account.email).contains(
                    actor_query_term_expression
                ),
            )
        )

    if moment_from is not None:
        history_query = history_query.where(
            Log.moment_utc >= datetime.combine(moment_from, time.min)
        )

    if moment_to is not None:
        history_query = history_query.where(
            Log.moment_utc < datetime.combine(moment_to + timedelta(days=1), time.min)
        )

    raw_row_list = (
        session.execute(
            history_query.order_by(Log.moment_utc.desc(), Log.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
        .mappings()
        .all()
    )
    page_row_list = [dict(row) for row in raw_row_list[:limit]]
    has_more = len(raw_row_list) > limit

    previous_row_payload_by_log_id = _build_previous_row_payload_by_log_id(
        session,
        table_name=validated_table_name,
        tenant_id=actor.tenant_id,
        page_row_list=page_row_list,
    )

    item_list: list[TenantHistoryRecordResponse] = []
    for history_row in page_row_list:
        row_payload = _coerce_log_row_payload_dict(history_row["row_payload"])
        diff_state = "not_applicable"
        field_change_list: list[TenantHistoryDiffFieldResponse] = []

        if history_row["action_type"] == "D":
            snapshot_row = previous_row_payload_by_log_id.get(int(history_row["id"]))
            if snapshot_row is not None:
                row_payload = snapshot_row

        if history_row["action_type"] == "U":
            previous_row = previous_row_payload_by_log_id.get(int(history_row["id"]))
            if previous_row is None:
                diff_state = "missing_previous"
            else:
                diff_state = "ready"
                field_change_list = _build_history_field_change_list(
                    current_row=row_payload,
                    previous_row=previous_row,
                )

        item_list.append(
            TenantHistoryRecordResponse(
                id=int(history_row["id"]),
                moment_utc=history_row["moment_utc"],
                actor_name=_resolve_history_actor_name(
                    display_name=history_row["actor_display_name"],
                    name=history_row["actor_name"],
                    email=history_row["actor_email"],
                ),
                action_type=history_row["action_type"],
                row_id=int(history_row["row_id"]),
                row=row_payload,
                field_change_list=field_change_list,
                diff_state=diff_state,
            )
        )

    return TenantHistoryResponse(
        item_list=item_list,
        has_more=has_more,
        next_offset=(offset + limit) if has_more else None,
    )


@router.get("/tenant/current", response_model=TenantCurrentResponse)
def get_current_tenant_detail(
    member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
):
    return TenantCurrentResponse(
        id=tenant.id,
        name=tenant.name,
        display_name=tenant.display_name,
        can_edit=_member_can_edit_tenant(member),
        can_delete=_member_can_delete_tenant(member),
    )


@router.get("/tenant/current/members", response_model=TenantMemberDirectoryResponse)
def get_current_tenant_member_directory(
    q: str | None = Query(default=None),
    role: str | None = Query(default=None),
    status_name: str | None = Query(default=None, alias="status"),
    role_name_list_raw: str | None = Query(default=None, alias="role_list"),
    status_name_list_raw: str | None = Query(default=None, alias="status_list"),
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    role_name_list = _parse_query_name_list(role_name_list_raw)
    status_name_list = _parse_query_name_list(status_name_list_raw)
    return _build_tenant_member_directory(
        session,
        actor=member,
        q=q,
        role=role,
        status_name=status_name,
        role_name_list=role_name_list,
        status_name_list=status_name_list,
    )


@router.post("/tenant/current/members", response_model=TenantMemberDirectoryResponse)
def create_current_tenant_member(
    body: TenantMemberCreateRequest,
    current_member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    if not _member_can_edit_tenant(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to invite members",
        )

    duplicate_id = session.scalar(
        select(Member.id)
        .where(
            Member.tenant_id == tenant.id,
            func.lower(Member.email) == body.email,
        )
        .limit(1)
    )
    if duplicate_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A member with this email already exists for this tenant",
        )

    invited = Member(
        name=body.name,
        display_name=body.display_name,
        email=body.email,
        tenant_id=tenant.id,
        account_id=None,
        role=MEMBER_ROLE,
        status=PENDING_STATUS,
    )
    session.add(invited)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_member_directory(session, actor=current_member)


@router.post(
    "/tenant/current/members/{member_id}/invite",
    response_model=TenantMemberInviteEmailResponse,
)
def post_current_tenant_member_invite_email(
    member_id: int,
    request: Request,
    current_member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    if not _member_can_edit_tenant(current_member):
        raise _member_invite_http_error(
            status.HTTP_403_FORBIDDEN,
            "member_invite_forbidden",
            "Insufficient permissions to send member invites",
        )

    target_member = session.get(Member, member_id)
    if not target_member or target_member.tenant_id != tenant.id:
        raise _member_invite_http_error(
            status.HTTP_404_NOT_FOUND,
            "member_invite_not_found",
            "Member not found for current tenant",
        )

    if target_member.account_id is not None:
        raise _member_invite_http_error(
            status.HTTP_400_BAD_REQUEST,
            "member_invite_already_linked",
            "Member already has a linked account",
        )

    if target_member.status != PENDING_STATUS:
        raise _member_invite_http_error(
            status.HTTP_400_BAD_REQUEST,
            "member_invite_invalid_status",
            "Invite email can only be sent for pending members",
        )

    to_email = (target_member.email or "").strip()
    if not to_email:
        raise _member_invite_http_error(
            status.HTTP_400_BAD_REQUEST,
            "member_invite_no_email",
            "Member has no email address for the invite",
        )

    _apply_member_audit_context(session, current_member)
    member_name = member_display_name(target_member)
    tenant_name = tenant_display_name(tenant)
    invite_locale = _invite_email_locale_from_request(request)

    ok, err = send_member_invite(
        to_email=to_email,
        member_name=member_name,
        tenant_name=tenant_name,
        locale=invite_locale,
    )
    if not ok:
        # 502: falha do provedor de e-mail (Resend), não bug interno do Valora.
        raise _member_invite_http_error(
            status.HTTP_502_BAD_GATEWAY,
            "member_invite_delivery_failed",
            err or "Failed to send invite email",
        )

    return TenantMemberInviteEmailResponse(
        message="Invite email sent successfully",
        email=to_email,
    )


@router.get("/tenant/current/scopes", response_model=TenantScopeDirectoryResponse)
def get_current_tenant_scope_directory(
    q: str | None = Query(default=None),
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    return _build_tenant_scope_directory(session, actor=member, q=q)


@router.get("/tenant/current/logs/{table_name}", response_model=TenantHistoryResponse)
def get_current_tenant_history(
    table_name: str,
    limit: int = Query(
        default=DEFAULT_HISTORY_PAGE_SIZE,
        ge=1,
        le=MAX_HISTORY_PAGE_SIZE,
    ),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    moment_from: date | None = Query(default=None, alias="from"),
    moment_to: date | None = Query(default=None, alias="to"),
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    return _build_tenant_history_response(
        session,
        actor=current_member,
        table_name=table_name,
        limit=limit,
        offset=offset,
        action_type=action,
        actor_query=actor,
        moment_from=moment_from,
        moment_to=moment_to,
    )


@router.patch("/me/current-scope", response_model=CurrentScopeSelectionResponse)
def patch_current_member_scope(
    body: CurrentScopeSelectionRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=body.scope_id,
    )
    current_member.current_scope_id = target_scope.id
    session.add(current_member)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)
    session.refresh(current_member)

    return CurrentScopeSelectionResponse(
        current_scope_id=_resolve_member_current_scope_id(session, actor=current_member)
    )


@router.patch("/tenant/current", response_model=TenantCurrentResponse)
def patch_current_tenant(
    body: TenantUpdateRequest,
    member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    if not _member_can_edit_tenant(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update tenant",
        )

    tenant.name = body.name
    tenant.display_name = body.display_name
    session.add(tenant)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    session.refresh(tenant)

    return TenantCurrentResponse(
        id=tenant.id,
        name=tenant.name,
        display_name=tenant.display_name,
        can_edit=_member_can_edit_tenant(member),
        can_delete=_member_can_delete_tenant(member),
    )


@router.delete("/tenant/current", response_model=TenantDeleteResponse)
def delete_current_tenant(
    member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    if not _member_can_delete_tenant(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only master members can delete tenant",
        )

    member_list = list(
        session.scalars(select(Member).where(Member.tenant_id == tenant.id))
    )
    _apply_member_audit_context(session, member)
    for tenant_member in member_list:
        session.delete(tenant_member)

    session.delete(tenant)
    session.commit()

    return TenantDeleteResponse(deleted_tenant_id=tenant.id)


@router.patch(
    "/tenant/current/members/{member_id}",
    response_model=TenantMemberDirectoryResponse,
)
def patch_current_tenant_member(
    member_id: int,
    body: TenantMemberUpdateRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_member = session.get(Member, member_id)
    if not target_member or target_member.tenant_id != current_member.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found for current tenant",
        )

    if not _member_can_edit_member_profile(current_member, target_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update member",
        )

    access_changed = (
        body.role != target_member.role or body.status != target_member.status
    )
    can_edit_access = _member_can_edit_member_access(current_member, target_member)
    if access_changed and not can_edit_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only master members can change role or status for this record",
        )

    if access_changed:
        _validate_member_status_transition(target_member, body.status)
        target_member.role = body.role
        target_member.status = body.status

    normalized_existing_email = (target_member.email or "").strip().lower()
    if body.email != normalized_existing_email:
        duplicate_id = session.scalar(
            select(Member.id)
            .where(
                Member.tenant_id == target_member.tenant_id,
                func.lower(Member.email) == body.email,
                Member.id != target_member.id,
            )
            .limit(1)
        )
        if duplicate_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A member with this email already exists for this tenant",
            )

    # Sempre gravar como name/display_name; evita divergência se a comparação acima falhar por edge case.
    target_member.email = body.email

    target_member.name = body.name
    target_member.display_name = body.display_name
    session.add(target_member)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_member_directory(session, actor=current_member)


@router.post(
    "/tenant/current/scopes",
    response_model=TenantScopeDirectoryResponse,
)
def create_current_tenant_scope(
    body: TenantScopeUpsertRequest,
    current_member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    if not _member_can_edit_scope(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create scope",
        )

    scope = Scope(
        name=body.name,
        display_name=body.display_name,
        tenant_id=tenant.id,
    )
    session.add(scope)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_scope_directory(session, actor=current_member)


@router.patch(
    "/tenant/current/scopes/{scope_id}",
    response_model=TenantScopeDirectoryResponse,
)
def patch_current_tenant_scope(
    scope_id: int,
    body: TenantScopeUpsertRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = session.get(Scope, scope_id)
    if not target_scope or target_scope.tenant_id != current_member.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scope not found for current tenant",
        )

    if not _member_can_edit_scope(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update scope",
        )

    target_scope.name = body.name
    target_scope.display_name = body.display_name
    session.add(target_scope)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_scope_directory(session, actor=current_member)


@router.delete(
    "/tenant/current/members/{member_id}",
    response_model=TenantMemberDirectoryResponse,
)
def delete_current_tenant_member(
    member_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_member = session.get(Member, member_id)
    if not target_member or target_member.tenant_id != current_member.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found for current tenant",
        )

    if not _member_can_delete_member(current_member, target_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only master members can delete another member",
        )

    _apply_member_audit_context(session, current_member)
    session.delete(target_member)
    session.commit()

    return _build_tenant_member_directory(session, actor=current_member)


@router.delete(
    "/tenant/current/scopes/{scope_id}",
    response_model=TenantScopeDirectoryResponse,
)
def delete_current_tenant_scope(
    scope_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )

    if not _member_can_delete_scope(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete scope",
        )

    has_location = session.scalar(
        select(Location.id).where(Location.scope_id == target_scope.id).limit(1)
    )
    if has_location is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scope while it still has locations",
        )

    has_item = session.scalar(
        select(Item.id).where(Item.scope_id == target_scope.id).limit(1)
    )
    if has_item is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scope while it still has items",
        )

    has_scope_field = session.scalar(
        select(ScopeField.id).where(ScopeField.scope_id == target_scope.id).limit(1)
    )
    if has_scope_field is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scope while it still has field definitions",
        )

    has_scope_action = session.scalar(
        select(ScopeAction.id).where(ScopeAction.scope_id == target_scope.id).limit(1)
    )
    if has_scope_action is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scope while it still has actions",
        )

    _apply_member_audit_context(session, current_member)
    session.delete(target_scope)
    session.commit()

    return _build_tenant_scope_directory(session, actor=current_member)


@router.get(
    "/tenant/current/scopes/{scope_id}/locations",
    response_model=TenantLocationDirectoryResponse,
)
def get_current_scope_location_directory(
    scope_id: int,
    q: str | None = Query(default=None),
    parent_location_id: int | None = Query(default=None),
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    return _build_tenant_location_directory(
        session,
        actor=current_member,
        scope=target_scope,
        q=q,
        parent_location_id=parent_location_id,
    )


@router.post(
    "/tenant/current/scopes/{scope_id}/locations",
    response_model=TenantLocationDirectoryResponse,
)
def create_current_scope_location(
    scope_id: int,
    body: TenantLocationUpsertRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create location",
        )

    location_list = _get_scope_location_list(session, scope_id=target_scope.id)
    _validate_location_parent_change(
        {item.id: item for item in location_list},
        parent_location_id=body.parent_location_id,
        moving_location_id=None,
    )
    location = Location(
        name=body.name,
        display_name=body.display_name,
        scope_id=target_scope.id,
        parent_location_id=body.parent_location_id,
        sort_order=sum(
            1
            for item in location_list
            if item.parent_location_id == body.parent_location_id
        ),
    )
    session.add(location)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_location_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.patch(
    "/tenant/current/scopes/{scope_id}/locations/{location_id}",
    response_model=TenantLocationDirectoryResponse,
)
def patch_current_scope_location(
    scope_id: int,
    location_id: int,
    body: TenantLocationUpsertRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_location = _get_scope_location_or_404(
        session,
        scope_id=target_scope.id,
        location_id=location_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update location",
        )

    if target_location.parent_location_id != body.parent_location_id:
        _move_location_in_scope(
            session,
            target_location=target_location,
            parent_location_id=body.parent_location_id,
            target_index=None,
        )

    target_location.name = body.name
    target_location.display_name = body.display_name
    session.add(target_location)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_location_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.post(
    "/tenant/current/scopes/{scope_id}/locations/{location_id}/move",
    response_model=TenantLocationDirectoryResponse,
)
def move_current_scope_location(
    scope_id: int,
    location_id: int,
    body: TenantLocationMoveRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_location = _get_scope_location_or_404(
        session,
        scope_id=target_scope.id,
        location_id=location_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to move location",
        )

    _move_location_in_scope(
        session,
        target_location=target_location,
        parent_location_id=body.parent_location_id,
        target_index=body.target_index,
    )
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_location_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.delete(
    "/tenant/current/scopes/{scope_id}/locations/{location_id}",
    response_model=TenantLocationDirectoryResponse,
)
def delete_current_scope_location(
    scope_id: int,
    location_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_location = _get_scope_location_or_404(
        session,
        scope_id=target_scope.id,
        location_id=location_id,
    )
    if not _member_can_delete_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete location",
        )

    _apply_member_audit_context(session, current_member)
    session.delete(target_location)
    session.flush()
    _normalize_scope_location_order(session, scope_id=target_scope.id)
    commit_session_with_null_if_empty(session)

    return _build_tenant_location_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.get(
    "/tenant/current/scopes/{scope_id}/kind",
    response_model=TenantKindListResponse,
)
def get_current_scope_kind_list(
    scope_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    can_edit = _member_can_edit_scope_hierarchy_directory(current_member)
    return TenantKindListResponse(
        can_edit=can_edit,
        item_list=_tenant_kind_record_list_for_scope(
            session, scope_id=target_scope.id
        ),
    )


@router.post(
    "/tenant/current/scopes/{scope_id}/kind",
    response_model=TenantKindListResponse,
)
def create_current_scope_kind(
    scope_id: int,
    body: TenantKindCreateRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create kind",
        )
    row = Kind(
        scope_id=target_scope.id,
        name=body.name,
        display_name=body.display_name,
    )
    session.add(row)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)
    return TenantKindListResponse(
        can_edit=True,
        item_list=_tenant_kind_record_list_for_scope(
            session, scope_id=target_scope.id
        ),
    )


@router.patch(
    "/tenant/current/scopes/{scope_id}/kind/{kind_id}",
    response_model=TenantKindListResponse,
)
def patch_current_scope_kind(
    scope_id: int,
    kind_id: int,
    body: TenantKindPatchRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update kind",
        )
    row = _get_scope_kind_or_404(session, scope_id=target_scope.id, kind_id=kind_id)
    if body.name is not None:
        row.name = body.name
    if body.display_name is not None:
        row.display_name = body.display_name
    if body.name is None and body.display_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    session.add(row)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)
    return TenantKindListResponse(
        can_edit=True,
        item_list=_tenant_kind_record_list_for_scope(
            session, scope_id=target_scope.id
        ),
    )


@router.delete(
    "/tenant/current/scopes/{scope_id}/kind/{kind_id}",
    response_model=TenantKindListResponse,
)
def delete_current_scope_kind(
    scope_id: int,
    kind_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete kind",
        )
    row = _get_scope_kind_or_404(session, scope_id=target_scope.id, kind_id=kind_id)
    in_use = (
        session.scalar(
            select(func.count()).select_from(Item).where(Item.kind_id == row.id)
        )
        or 0
    )
    if int(in_use) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete kind while items still reference it",
        )
    session.delete(row)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)
    return TenantKindListResponse(
        can_edit=True,
        item_list=_tenant_kind_record_list_for_scope(
            session, scope_id=target_scope.id
        ),
    )


@router.get(
    "/tenant/current/scopes/{scope_id}/items",
    response_model=TenantItemDirectoryResponse,
)
def get_current_scope_item_directory(
    scope_id: int,
    q: str | None = Query(default=None),
    parent_item_id: int | None = Query(default=None),
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    return _build_tenant_item_directory(
        session,
        actor=current_member,
        scope=target_scope,
        q=q,
        parent_item_id=parent_item_id,
    )


@router.post(
    "/tenant/current/scopes/{scope_id}/items",
    response_model=TenantItemDirectoryResponse,
)
def create_current_scope_item(
    scope_id: int,
    body: TenantItemUpsertRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create item",
        )

    item_row_list = _get_scope_item_list(session, scope_id=target_scope.id)
    _validate_item_parent_change(
        {row.id: row for row in item_row_list},
        parent_item_id=body.parent_item_id,
        moving_item_id=None,
    )
    _get_scope_kind_or_404(
        session, scope_id=target_scope.id, kind_id=body.kind_id
    )
    new_item = Item(
        kind_id=body.kind_id,
        scope_id=target_scope.id,
        parent_item_id=body.parent_item_id,
        sort_order=sum(
            1 for row in item_row_list if row.parent_item_id == body.parent_item_id
        ),
    )
    session.add(new_item)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_item_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.patch(
    "/tenant/current/scopes/{scope_id}/items/{item_id}",
    response_model=TenantItemDirectoryResponse,
)
def patch_current_scope_item(
    scope_id: int,
    item_id: int,
    body: TenantItemUpsertRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_item = _get_scope_item_or_404(
        session,
        scope_id=target_scope.id,
        item_id=item_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update item",
        )

    if target_item.parent_item_id != body.parent_item_id:
        _move_item_in_scope(
            session,
            target_item=target_item,
            parent_item_id=body.parent_item_id,
            target_index=None,
        )

    _get_scope_kind_or_404(
        session, scope_id=target_scope.id, kind_id=body.kind_id
    )
    target_item.kind_id = body.kind_id
    session.add(target_item)
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_item_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.post(
    "/tenant/current/scopes/{scope_id}/items/{item_id}/move",
    response_model=TenantItemDirectoryResponse,
)
def move_current_scope_item(
    scope_id: int,
    item_id: int,
    body: TenantItemMoveRequest,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_item = _get_scope_item_or_404(
        session,
        scope_id=target_scope.id,
        item_id=item_id,
    )
    if not _member_can_edit_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to move item",
        )

    _move_item_in_scope(
        session,
        target_item=target_item,
        parent_item_id=body.parent_item_id,
        target_index=body.target_index,
    )
    _apply_member_audit_context(session, current_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_item_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.delete(
    "/tenant/current/scopes/{scope_id}/items/{item_id}",
    response_model=TenantItemDirectoryResponse,
)
def delete_current_scope_item(
    scope_id: int,
    item_id: int,
    current_member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    target_scope = _get_tenant_scope_for_location(
        session,
        actor=current_member,
        scope_id=scope_id,
    )
    target_item = _get_scope_item_or_404(
        session,
        scope_id=target_scope.id,
        item_id=item_id,
    )
    if not _member_can_delete_scope_hierarchy_directory(current_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete item",
        )

    _apply_member_audit_context(session, current_member)
    session.delete(target_item)
    session.flush()
    _normalize_scope_item_order(session, scope_id=target_scope.id)
    commit_session_with_null_if_empty(session)

    return _build_tenant_item_directory(
        session,
        actor=current_member,
        scope=target_scope,
    )


@router.get("/me", response_model=AuthSessionResponse)
def auth_me(
    account: Account = Depends(get_current_account),
    member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
    session: Session = Depends(get_session),
):
    return AuthSessionResponse(
        account=SessionAccount(
            id=account.id,
            email=account.email,
            name=account.name,
            display_name=account.display_name,
            provider=account.provider,
        ),
        member=SessionMember(
            id=member.id,
            role=member.role,
            status=member_status_name(member.status),
            name=member.name,
            display_name=member.display_name,
            email=member.email,
            current_scope_id=_resolve_member_current_scope_id(session, actor=member),
        ),
        tenant=SessionTenant(
            id=tenant.id,
            name=tenant.name,
            display_name=tenant_display_name(tenant),
        ),
    )


@router.post("/invites/{member_id}/accept", response_model=InviteActionResponse)
def accept_invite(
    member_id: int,
    account: Account = Depends(get_current_account),
    session: Session = Depends(get_session),
):
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )

    if member.account_id is not None:
        if member.account_id != account.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
    elif member.email != account.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if member.status != PENDING_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite is not pending",
        )

    _sync_member_identity(member, account)
    member.status = ACTIVE_STATUS
    session.add(member)
    apply_audit_gucs_for_session(session, member.tenant_id, account.id)
    commit_session_with_null_if_empty(session)

    return InviteActionResponse(
        member_id=member.id,
        tenant_id=member.tenant_id,
        status=member_status_name(member.status),
    )


@router.post("/invites/{member_id}/reject", response_model=InviteActionResponse)
def reject_invite(
    member_id: int,
    account: Account = Depends(get_current_account),
    session: Session = Depends(get_session),
):
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )

    if member.account_id is not None:
        if member.account_id != account.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
    elif member.email != account.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if member.status != PENDING_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite is not pending",
        )

    _sync_member_identity(member, account)
    member.status = DISABLED_STATUS
    session.add(member)
    apply_audit_gucs_for_session(session, member.tenant_id, account.id)
    commit_session_with_null_if_empty(session)

    return InviteActionResponse(
        member_id=member.id,
        tenant_id=member.tenant_id,
        status=member_status_name(member.status),
    )
