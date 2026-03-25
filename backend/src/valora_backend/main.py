from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from valora_backend.api.auth import router as auth_router
from valora_backend.audit.middleware import AuditContextMiddleware
from valora_backend.db import engine, get_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import tardio: evita carregar o modelo Log no metadata antes de testes SQLite com create_all.
    from valora_backend.audit.session_listener import register_audit_listener

    register_audit_listener()
    yield
    engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Valora Backend",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(AuditContextMiddleware)

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
