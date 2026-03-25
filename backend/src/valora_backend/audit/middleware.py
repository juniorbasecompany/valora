# Middleware ASGI: JWT → contexto de auditoria. Comentários em PT-BR.

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from valora_backend.audit.context import reset_audit_context, set_audit_context
from valora_backend.auth.jwt import decode_token_payload_optional


class AuditContextMiddleware(BaseHTTPMiddleware):
    """
    Lê Authorization: Bearer, valida JWT (sem exigir Member activo) e preenche contextvars.
    Token inválido ou sem sub/tenant_id: não há contexto — o listener não escreve em log.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        auth_header = request.headers.get("authorization") or request.headers.get(
            "Authorization"
        )
        ctx_token = None
        if auth_header and auth_header.lower().startswith("bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
            if raw_token:
                payload = decode_token_payload_optional(raw_token)
                if payload is not None:
                    sub_raw = payload.get("sub")
                    tenant_raw = payload.get("tenant_id")
                    if sub_raw is not None and tenant_raw is not None:
                        try:
                            ctx_token = set_audit_context(
                                account_id=int(sub_raw),
                                tenant_id=int(tenant_raw),
                            )
                        except (TypeError, ValueError):
                            ctx_token = None

        try:
            return await call_next(request)
        finally:
            if ctx_token is not None:
                reset_audit_context(ctx_token)
