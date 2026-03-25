# Base declarativa SQLAlchemy 2.

from sqlalchemy import BigInteger, Integer
from sqlalchemy.orm import DeclarativeBase

# SQLite precisa de INTEGER (não BIGINT) no PK para autoincremento; Postgres mantém BIGINT.
BIGINT = BigInteger().with_variant(Integer(), "sqlite")


class Base(DeclarativeBase):
    """Base para metadados e futuras migrations (Alembic)."""
