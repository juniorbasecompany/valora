"""
Mapeamento de erros PostgreSQL (SQLSTATE + constraint) para códigos de API estáveis.

Para acrescentar um caso: inclua uma entrada em `PG_REGISTRY_RULE_LIST`, mais específica
primeiro (constraint nomeada), depois regra só com `pg_code` se fizer sentido.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.responses import JSONResponse

# Limite para não inflar respostas HTTP com mensagens enormes do servidor.
_MAX_UNHANDLED_MESSAGE_LEN = 4000

# Código estável para erros sem regra dedicada (mensagem original do PG/driver na UI).
UNHANDLED_DB_ERROR_CODE = "error.db.unhandled"


@dataclass(frozen=True)
class PgErrorContext:
    """Contexto extraído do driver (psycopg) para classificação."""

    pg_code: str
    constraint_name: str | None
    schema_name: str | None
    table_name: str | None


@dataclass(frozen=True)
class PgRegistryRule:
    """Regra ordenada: `constraint_name` None casa qualquer constraint para aquele `pg_code`."""

    pg_code: str
    constraint_name: str | None
    api_code: str
    status_code: int


PG_REGISTRY_RULE_LIST: list[PgRegistryRule] = [
    PgRegistryRule(
        pg_code="23503",
        constraint_name="result_formula_id_fkey",
        api_code="error.db.foreign_key_result_references_formula",
        status_code=409,
    ),
    PgRegistryRule(
        pg_code="23503",
        constraint_name=None,
        api_code="error.db.foreign_key_violation",
        status_code=409,
    ),
]


def _normalize_pg_code(raw: object | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    return s if len(s) == 5 else None


def extract_pg_error_context(exc: BaseException) -> PgErrorContext | None:
    """Percorre a cadeia de exceções e devolve o primeiro contexto com SQLSTATE válido."""
    current: BaseException | None = exc
    seen: set[int] = set()
    for _ in range(16):
        if current is None:
            break
        ident = id(current)
        if ident in seen:
            break
        seen.add(ident)

        orig = getattr(current, "orig", None)
        if orig is not None:
            ctx = _context_from_orig(orig)
            if ctx is not None:
                return ctx

        inner = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
        current = inner if isinstance(inner, BaseException) else None

    return None


def _context_from_orig(orig: Any) -> PgErrorContext | None:
    pg_code = _normalize_pg_code(getattr(orig, "pgcode", None))
    if pg_code is None:
        pg_code = _normalize_pg_code(getattr(orig, "sqlstate", None))
    if pg_code is None:
        return None

    diag = getattr(orig, "diag", None)
    constraint_name: str | None = None
    schema_name: str | None = None
    table_name: str | None = None
    if diag is not None:
        c = getattr(diag, "constraint_name", None)
        if c is not None and str(c).strip():
            constraint_name = str(c).strip()
        sn = getattr(diag, "schema_name", None)
        if sn is not None and str(sn).strip():
            schema_name = str(sn).strip()
        tn = getattr(diag, "table_name", None)
        if tn is not None and str(tn).strip():
            table_name = str(tn).strip()

    return PgErrorContext(
        pg_code=pg_code,
        constraint_name=constraint_name,
        schema_name=schema_name,
        table_name=table_name,
    )


def _primary_message_from_orig(orig: Any) -> str | None:
    diag = getattr(orig, "diag", None)
    if diag is not None:
        mp = getattr(diag, "message_primary", None)
        if mp is not None and str(mp).strip():
            return str(mp).strip()
    pgerr = getattr(orig, "pgerror", None)
    if pgerr is not None and str(pgerr).strip():
        return str(pgerr).strip()
    s = str(orig).strip()
    return s if s else None


def primary_message_for_db_exception(exc: BaseException) -> str:
    """Uma linha principal para exibir ao usuário em erros não mapeados."""
    current: BaseException | None = exc
    seen: set[int] = set()
    for _ in range(16):
        if current is None:
            break
        ident = id(current)
        if ident in seen:
            break
        seen.add(ident)

        orig = getattr(current, "orig", None)
        if orig is not None:
            msg = _primary_message_from_orig(orig)
            if msg:
                return msg[:_MAX_UNHANDLED_MESSAGE_LEN]

        msg = str(current).strip()
        if msg and msg != type(current).__name__:
            return msg[:_MAX_UNHANDLED_MESSAGE_LEN]

        inner = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
        current = inner if isinstance(inner, BaseException) else None

    return "Database error."


def match_pg_registry_rule(ctx: PgErrorContext) -> PgRegistryRule | None:
    """Primeira regra compatível: constraints nomeadas antes do fallback só com `pg_code`."""
    for rule in PG_REGISTRY_RULE_LIST:
        if ctx.pg_code != rule.pg_code:
            continue
        if rule.constraint_name is None:
            continue
        if ctx.constraint_name == rule.constraint_name:
            return rule
    for rule in PG_REGISTRY_RULE_LIST:
        if ctx.pg_code != rule.pg_code:
            continue
        if rule.constraint_name is None:
            return rule
    return None


def try_build_pg_registry_error_response(exc: BaseException) -> JSONResponse | None:
    """
    Se o erro tiver SQLSTATE + metadados reconhecidos, devolve resposta JSON com `detail.code`.
    """
    ctx = extract_pg_error_context(exc)
    if ctx is None:
        return None
    rule = match_pg_registry_rule(ctx)
    if rule is None:
        return None
    detail: dict[str, str] = {
        "code": rule.api_code,
        "pg_code": ctx.pg_code,
    }
    if ctx.constraint_name:
        detail["constraint"] = ctx.constraint_name
    if ctx.schema_name:
        detail["schema_name"] = ctx.schema_name
    if ctx.table_name:
        detail["table_name"] = ctx.table_name
    return JSONResponse({"detail": detail}, status_code=rule.status_code)


def build_unhandled_db_error_detail(exc: BaseException) -> dict[str, Any]:
    """Corpo `detail` para erros sem regra: mensagem original + código estável."""
    ctx = extract_pg_error_context(exc)
    message = primary_message_for_db_exception(exc)
    detail: dict[str, Any] = {
        "code": UNHANDLED_DB_ERROR_CODE,
        "message": message,
    }
    if ctx is not None:
        detail["pg_code"] = ctx.pg_code
        if ctx.constraint_name:
            detail["constraint"] = ctx.constraint_name
    return detail


def build_unhandled_db_error_response(
    exc: BaseException, *, status_code: int = 500
) -> JSONResponse:
    return JSONResponse(
        {"detail": build_unhandled_db_error_detail(exc)},
        status_code=status_code,
    )


def build_unhandled_detail_from_blob(blob: str) -> dict[str, Any]:
    """Fallback quando só há texto agregado (ex.: StatementError sem orig DBAPI)."""
    text = blob.strip()
    if len(text) > _MAX_UNHANDLED_MESSAGE_LEN:
        text = text[:_MAX_UNHANDLED_MESSAGE_LEN]
    if not text:
        text = "Database error."
    return {"code": UNHANDLED_DB_ERROR_CODE, "message": text}
