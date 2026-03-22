from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

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
from valora_backend.db import get_session
from valora_backend.model.identity import Account, Member, Tenant
from valora_backend.model.null_if_empty import commit_session_with_null_if_empty

router = APIRouter(prefix="/auth", tags=["auth"])

ACTIVE_STATUS = 1
PENDING_STATUS = 2
DISABLED_STATUS = 3
GOOGLE_PROVIDER = "google"


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
    def strip_and_limit(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        if len(cleaned) > 2000:
            raise ValueError("must be at most 2000 characters")
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
    item_list: list[TenantMemberRecord] = Field(default_factory=list)


class TenantMemberUpdateRequest(BaseModel):
    name: str
    display_name: str
    role: int
    status: int

    @field_validator("name", "display_name")
    @classmethod
    def strip_and_limit_member_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        if len(cleaned) > 2000:
            raise ValueError("must be at most 2000 characters")
        return cleaned

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


class AuthSessionResponse(BaseModel):
    account: SessionAccount
    member: SessionMember
    tenant: SessionTenant


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


def _find_or_create_account(session: Session, identity: GoogleIdentity) -> Account:
    account = session.scalar(
        select(Account).where(
            Account.provider == GOOGLE_PROVIDER,
            Account.provider_subject == identity.provider_subject,
        )
    )
    if not account:
        account = session.scalar(select(Account).where(Account.email == identity.email))

    if account:
        if _sync_account_name(account, identity):
            session.add(account)
            commit_session_with_null_if_empty(session)
            session.refresh(account)
        return account

    name, display_name = build_account_name(identity.name, identity.email)
    account = Account(
        name=name,
        display_name=display_name,
        email=identity.email,
        provider=GOOGLE_PROVIDER,
        provider_subject=identity.provider_subject,
    )
    session.add(account)
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

    if member.email != account.email:
        member.email = account.email
        changed = True

    return changed


def _link_pending_member_to_account(session: Session, account: Account) -> None:
    pending_member_list = session.scalars(
        select(Member).where(
            Member.email == account.email,
            Member.account_id.is_(None),
            Member.status == PENDING_STATUS,
        )
    ).all()

    changed = False
    for pending_member in pending_member_list:
        changed = _sync_member_identity(pending_member, account) or changed
        session.add(pending_member)

    if changed:
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


def _create_initial_tenant_member(session: Session, account: Account) -> Member:
    tenant = Tenant(
        name=account.display_name,
        display_name=account.display_name,
    )
    session.add(tenant)
    commit_session_with_null_if_empty(session)
    session.refresh(tenant)

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
        commit_session_with_null_if_empty(session)
        session.refresh(pending_member)

    return pending_member


@router.post("/google", response_model=AuthResponse)
def auth_google(
    body: GoogleTokenRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity)
    _link_pending_member_to_account(session, account)

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
        session.add(member)
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
    body: GoogleSelectTenantRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity)
    _link_pending_member_to_account(session, account)

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
    body: GoogleTokenRequest,
    session: Session = Depends(get_session),
):
    identity = verify_google_token(body.id_token)
    account = _find_or_create_account(session, identity)
    _link_pending_member_to_account(session, account)

    tenant_option_list, invite_option_list = _get_account_context_option_list(
        session,
        account=account,
    )
    if tenant_option_list or invite_option_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account already has tenant access or pending invite",
        )

    member = _create_initial_tenant_member(session, account)
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


def _build_tenant_member_directory(
    session: Session, *, actor: Member
) -> TenantMemberDirectoryResponse:
    member_list = list(
        session.scalars(select(Member).where(Member.tenant_id == actor.tenant_id))
    )
    member_list.sort(
        key=lambda item: (
            item.role,
            item.status,
            member_display_name(item).lower(),
            item.email.lower(),
            item.id,
        )
    )
    return TenantMemberDirectoryResponse(
        can_edit=_member_can_edit_tenant(actor),
        item_list=[_serialize_tenant_member(actor, item) for item in member_list],
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
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    return _build_tenant_member_directory(session, actor=member)


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

    member_list = list(session.scalars(select(Member).where(Member.tenant_id == tenant.id)))
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

    target_member.name = body.name
    target_member.display_name = body.display_name
    session.add(target_member)
    commit_session_with_null_if_empty(session)

    return _build_tenant_member_directory(session, actor=current_member)


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

    session.delete(target_member)
    session.commit()

    return _build_tenant_member_directory(session, actor=current_member)


@router.get("/me", response_model=AuthSessionResponse)
def auth_me(
    account: Account = Depends(get_current_account),
    member: Member = Depends(get_current_member),
    tenant: Tenant = Depends(get_current_tenant),
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
    commit_session_with_null_if_empty(session)

    return InviteActionResponse(
        member_id=member.id,
        tenant_id=member.tenant_id,
        status=member_status_name(member.status),
    )
