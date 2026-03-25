from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import HTTPException, status

from valora_backend.config import Settings


def create_access_token(
    *, account_id: int, tenant_id: int, remember_me: bool = False
) -> str:
    settings = Settings()
    now = datetime.now(UTC)
    if remember_me:
        lifetime = timedelta(days=settings.jwt_remember_me_expiration_days)
    else:
        lifetime = timedelta(hours=settings.jwt_expiration_hours)
    payload: dict[str, Any] = {
        "sub": str(account_id),
        "tenant_id": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "iss": settings.jwt_issuer,
    }
    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def verify_token(token: str) -> dict[str, Any]:
    settings = Settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    return payload
