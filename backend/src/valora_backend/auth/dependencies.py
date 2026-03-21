from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from valora_backend.auth.jwt import verify_token
from valora_backend.auth.service import member_role_name
from valora_backend.db import get_session
from valora_backend.model.identity import Account, Member, Tenant

bearer = HTTPBearer(auto_error=False)


def get_token_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_token(credentials.credentials)


def get_current_account(
    payload: dict[str, Any] = Depends(get_token_payload),
    session: Session = Depends(get_session),
) -> Account:
    account_id_raw = payload.get("sub")
    if not account_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    account = session.get(Account, int(account_id_raw))
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found",
        )

    return account


def get_current_member(
    payload: dict[str, Any] = Depends(get_token_payload),
    session: Session = Depends(get_session),
) -> Member:
    account_id_raw = payload.get("sub")
    tenant_id_raw = payload.get("tenant_id")
    if not account_id_raw or not tenant_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    member = session.scalar(
        select(Member).where(
            Member.account_id == int(account_id_raw),
            Member.tenant_id == int(tenant_id_raw),
            Member.status == 1,
        )
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active member not found for tenant",
        )

    return member


def get_current_tenant(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
) -> Tenant:
    tenant = session.get(Tenant, member.tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    return tenant


def require_role(required_role: int):
    def role_checker(member: Member = Depends(get_current_member)) -> Member:
        if member.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {member_role_name(required_role)}",
            )
        return member

    return role_checker
