import os
import sys
import traceback
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError, StatementError
from sqlalchemy.orm import Session

from valora_backend.api.auth import router as auth_router
from valora_backend.api.rules import router as scope_rules_router
from valora_backend.config import Settings
from valora_backend.db import dispose_engine, get_session
from valora_backend.middleware.audit_request_context import AuditRequestContextMiddleware
from valora_backend.pg_error_response import (
    build_unhandled_db_error_response,
    build_unhandled_detail_from_blob,
    try_build_pg_registry_error_response,
)


def _db_exception_message_blob(exc: BaseException) -> str:
    """Texto agregado para classificar erros (drivers colocam a mensagem do PG em `orig` ou na causa)."""
    parts: list[str] = []
    seen: set[int] = set()
    current: BaseException | None = exc
    for _ in range(16):
        if current is None:
            break
        ident = id(current)
        if ident in seen:
            break
        seen.add(ident)
        parts.append(str(current))
        orig = getattr(current, "orig", None)
        if orig is not None:
            parts.append(str(orig))
        pgerror = getattr(orig, "pgerror", None) if orig is not None else None
        if pgerror:
            parts.append(str(pgerror))
        diag = getattr(orig, "diag", None)
        if diag is not None:
            message_primary = getattr(diag, "message_primary", None)
            if message_primary:
                parts.append(str(message_primary))
        current = current.__cause__ or current.__context__
    return " | ".join(parts)


def _log_valora_db_env_presence() -> None:
    """Diagnóstico em runtime: confirma se o PaaS injetou variáveis (sem revelar valores)."""
    keys = (
        "DATABASE_URL",
        "VALORA_DATABASE_URL",
        "POSTGRES_PASSWORD",
        "PGPASSWORD",
        "PGHOST",
    )
    parts = [
        f"{k}={'yes' if (os.environ.get(k) or '').strip() else 'no'}" for k in keys
    ]
    print(f"VALORA_BOOT {' '.join(parts)}", file=sys.stderr, flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Valida env (DATABASE_URL ou POSTGRES_PASSWORD) antes de marcar o serviço como pronto.
    try:
        Settings()
    except ValidationError:
        _log_valora_db_env_presence()
        raise
    yield
    dispose_engine()


def _known_pg_tuple_from_message_text(origin_message: str) -> tuple[int, str] | None:
    """Erros PostgreSQL frequentes no fluxo auditoria + tabela log (schema drift, FK)."""
    lower = origin_message.lower()
    if "violates check constraint" in lower and "log_table_name_chk" in lower:
        return (
            500,
            (
                "Schema de auditoria desatualizado: constraint log_table_name_chk. "
                "Execute alembic upgrade head no banco configurado em DATABASE_URL."
            ),
        )
    if "violates check constraint" in lower and "log_row_payload" in lower:
        return (
            500,
            (
                "Inconsistencia na tabela log (constraint log_row_payload). "
                "Verifique migracoes aplicadas (alembic upgrade head)."
            ),
        )
    if "foreign key constraint" in lower and "log" in lower:
        return (
            500,
            (
                "Falha ao gravar na tabela log (integridade referencial). "
                "Verifique tenant_id/account_id e migracoes."
            ),
        )
    return None


def _audit_tuple_from_message_text(origin_message: str) -> tuple[int, str] | None:
    """Classifica mensagens conhecidas dos gatilhos de auditoria (PostgreSQL)."""
    if "Audit context missing tenant_id" in origin_message:
        return (
            409,
            (
                "Operacao bloqueada pela auditoria: a sessao atual nao informou "
                "o licenciado responsavel. Atualize a pagina e tente novamente."
            ),
        )
    if "Audit context missing account_id" in origin_message:
        return (
            409,
            (
                "Operacao bloqueada pela auditoria: a sessao atual nao informou "
                "a conta responsavel. Atualize a pagina e tente novamente."
            ),
        )
    if "Audit policy missing for table" in origin_message:
        return (
            500,
            "Operacao bloqueada: a tabela ainda nao possui politica de auditoria configurada.",
        )
    return None


def try_build_audit_db_error_response(exc: DBAPIError) -> JSONResponse | None:
    mapped = _audit_tuple_from_message_text(_db_exception_message_blob(exc))
    if mapped is None:
        return None
    status_code, detail = mapped
    return JSONResponse({"detail": detail}, status_code=status_code)


def try_build_audit_response_from_message_blob(blob: str) -> JSONResponse | None:
    mapped = _audit_tuple_from_message_text(blob)
    if mapped is None:
        return None
    status_code, detail = mapped
    return JSONResponse({"detail": detail}, status_code=status_code)


def try_build_known_pg_error_response(exc: DBAPIError) -> JSONResponse | None:
    mapped = _known_pg_tuple_from_message_text(_db_exception_message_blob(exc))
    if mapped is None:
        return None
    status_code, detail = mapped
    return JSONResponse({"detail": detail}, status_code=status_code)


def try_build_known_pg_response_from_message_blob(blob: str) -> JSONResponse | None:
    mapped = _known_pg_tuple_from_message_text(blob)
    if mapped is None:
        return None
    status_code, detail = mapped
    return JSONResponse({"detail": detail}, status_code=status_code)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Valora Backend",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(AuditRequestContextMiddleware)

    async def handle_sqlalchemy_db_error(
        _request: Request, exc: DBAPIError
    ) -> JSONResponse:
        response = try_build_pg_registry_error_response(exc)
        if response is not None:
            blob = _db_exception_message_blob(exc)
            print(f"VALORA_DB_MAPPED_PG_REGISTRY {blob[:2000]}", file=sys.stderr, flush=True)
            return response
        response = try_build_audit_db_error_response(exc)
        if response is not None:
            return response
        response = try_build_known_pg_error_response(exc)
        if response is not None:
            blob = _db_exception_message_blob(exc)
            print(f"VALORA_DB_MAPPED_PG {blob[:2000]}", file=sys.stderr, flush=True)
            return response
        blob = _db_exception_message_blob(exc)
        print(f"VALORA_DB_UNMAPPED {blob[:4000]}", file=sys.stderr, flush=True)
        traceback.print_exception(exc, file=sys.stderr)
        return build_unhandled_db_error_response(exc, status_code=500)

    @app.exception_handler(StatementError)
    async def handle_statement_error(_request: Request, exc: StatementError):
        """Erros do driver podem vir embrulhados em StatementError (nao e subclasse de DBAPIError)."""
        orig = getattr(exc, "orig", None)
        if isinstance(orig, DBAPIError):
            return await handle_sqlalchemy_db_error(_request, orig)
        blob = _db_exception_message_blob(exc)
        audit_response = try_build_audit_response_from_message_blob(blob)
        if audit_response is not None:
            return audit_response
        known_response = try_build_known_pg_response_from_message_blob(blob)
        if known_response is not None:
            print(f"VALORA_STATEMENT_MAPPED_PG {blob[:2000]}", file=sys.stderr, flush=True)
            return known_response
        print(f"VALORA_STATEMENT_ERROR {blob[:4000]}", file=sys.stderr, flush=True)
        traceback.print_exception(exc, file=sys.stderr)
        return JSONResponse(
            {"detail": build_unhandled_detail_from_blob(blob)},
            status_code=500,
        )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(_request: Request, exc: IntegrityError):
        return await handle_sqlalchemy_db_error(_request, exc)

    @app.exception_handler(DBAPIError)
    async def handle_dbapi_error(_request: Request, exc: DBAPIError):
        return await handle_sqlalchemy_db_error(_request, exc)

    @app.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/db")
    def health_db(session: Session = Depends(get_session)) -> dict[str, str]:
        session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}

    app.include_router(auth_router)
    app.include_router(scope_rules_router)

    return app


app = create_app()
