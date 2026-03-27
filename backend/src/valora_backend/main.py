import os
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from valora_backend.api.auth import router as auth_router
from valora_backend.config import Settings
from valora_backend.db import dispose_engine, get_session
from valora_backend.middleware.audit_request_context import AuditRequestContextMiddleware


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


def audit_detail_from_dbapi_error(exc: DBAPIError) -> tuple[int, str] | None:
    origin_message = str(getattr(exc, "orig", exc))
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
    mapped = audit_detail_from_dbapi_error(exc)
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
        response = try_build_audit_db_error_response(exc)
        if response is not None:
            return response
        raise RuntimeError("Unhandled database error") from exc

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

    return app


app = create_app()
