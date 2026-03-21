from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from valora_backend.config import Settings


@dataclass(slots=True)
class GoogleIdentity:
    email: str
    name: str
    provider_subject: str


def verify_google_token(token: str) -> GoogleIdentity:
    """Valida o `id_token` do Google e retorna a identidade normalizada."""
    settings = Settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID not configured",
        )

    try:
        payload = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=60,
        )
    except ValueError as exc:
        error_message = str(exc)
        if "Token's audience" in error_message or "Wrong audience" in error_message:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience mismatch",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google ID token",
        ) from exc
    except Exception as exc:  # pragma: no cover - proteção defensiva
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google ID token",
        ) from exc

    email = str(payload.get("email", "")).strip().lower()
    provider_subject = str(payload.get("sub", "")).strip()
    name = str(payload.get("name", "")).strip()
    email_verified = bool(payload.get("email_verified"))

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token missing email",
        )

    if not provider_subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token missing subject",
        )

    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email is not verified",
        )

    return GoogleIdentity(
        email=email,
        name=name,
        provider_subject=provider_subject,
    )
