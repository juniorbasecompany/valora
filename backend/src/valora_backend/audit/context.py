# Contexto de auditoria por pedido (contextvars). Comentários em português do Brasil.

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass


@dataclass(frozen=True)
class AuditContext:
    """Quem está a agir no contexto HTTP actual (conta + licenciado)."""

    account_id: int
    tenant_id: int


_audit_ctx_var: ContextVar[AuditContext | None] = ContextVar(
    "valora_audit_context",
    default=None,
)
_audit_processing_var: ContextVar[bool] = ContextVar(
    "valora_audit_processing",
    default=False,
)


def get_audit_context() -> AuditContext | None:
    """Devolve o contexto activo ou None (sem JWT válido com sub + tenant_id)."""
    return _audit_ctx_var.get()


def set_audit_context(*, account_id: int, tenant_id: int) -> Token:
    """Define o contexto; devolve token para reset (ex.: fim do middleware)."""
    return _audit_ctx_var.set(AuditContext(account_id=account_id, tenant_id=tenant_id))


def reset_audit_context(token: Token) -> None:
    """Restaura o valor anterior do ContextVar."""
    _audit_ctx_var.reset(token)


def clear_audit_context() -> None:
    """Útil em testes: remove contexto sem token de reset."""
    _audit_ctx_var.set(None)


def get_audit_processing() -> bool:
    return _audit_processing_var.get()


def set_audit_processing(value: bool) -> Token:
    return _audit_processing_var.set(value)


def reset_audit_processing(token: Token) -> None:
    _audit_processing_var.reset(token)
