# Base declarativa SQLAlchemy 2.

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base para metadados e futuras migrations (Alembic)."""
