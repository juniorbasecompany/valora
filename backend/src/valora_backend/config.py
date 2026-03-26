# Configuração da aplicação via variáveis de ambiente.

from typing import Self
from urllib.parse import quote_plus

from pydantic import (
    AliasChoices,
    Field,
    SecretStr,
    computed_field,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


def _sqlalchemy_url_with_psycopg3(url: str) -> str:
    """Railway/Heroku usam `postgresql://`; o projeto usa o driver psycopg v3."""
    u = url.strip()
    if u.startswith("postgres://"):
        u = "postgresql://" + u.removeprefix("postgres://")
    if u.startswith("postgresql://") and not u.startswith("postgresql+"):
        return "postgresql+psycopg://" + u.removeprefix("postgresql://")
    return u


class Settings(BaseSettings):
    """Configuração carregada de variáveis de ambiente e `.env`."""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = Field(
        default="localhost",
        validation_alias=AliasChoices("POSTGRES_HOST", "PGHOST", "postgres_host"),
    )
    postgres_port: int = Field(
        default=5434,
        validation_alias=AliasChoices("POSTGRES_PORT", "PGPORT", "postgres_port"),
    )
    postgres_user: str = Field(
        default="valora",
        validation_alias=AliasChoices("POSTGRES_USER", "PGUSER", "postgres_user"),
    )
    postgres_db: str = Field(
        default="valora",
        validation_alias=AliasChoices("POSTGRES_DB", "PGDATABASE", "postgres_db"),
    )
    postgres_password: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "POSTGRES_PASSWORD",
            "PGPASSWORD",
            "postgres_password",
        ),
    )
    database_url_override: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "VALORA_DATABASE_URL"),
    )

    @field_validator("database_url_override", mode="before")
    @classmethod
    def _database_url_vazio_e_none(cls, value: object) -> object:
        """Referência Railway mal resolvida pode vir como string vazia."""
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    google_client_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GOOGLE_CLIENT_ID", "google_client_id"),
    )
    jwt_secret: SecretStr = Field(
        default=SecretStr("valora-dev-secret-change-me"),
        validation_alias=AliasChoices("APP_JWT_SECRET", "JWT_SECRET", "jwt_secret"),
    )
    jwt_issuer: str = Field(
        default="valora",
        validation_alias=AliasChoices("APP_JWT_ISSUER", "JWT_ISSUER", "jwt_issuer"),
    )
    jwt_expiration_hours: int = Field(
        default=8,
        validation_alias=AliasChoices(
            "APP_JWT_EXPIRATION_HOURS",
            "JWT_EXPIRATION_HOURS",
            "jwt_expiration_hours",
        ),
    )
    jwt_remember_me_expiration_days: int = Field(
        default=30,
        validation_alias=AliasChoices(
            "APP_JWT_REMEMBER_ME_EXPIRATION_DAYS",
            "JWT_REMEMBER_ME_EXPIRATION_DAYS",
            "jwt_remember_me_expiration_days",
        ),
    )

    @model_validator(mode="after")
    def _exige_postgres_ou_database_url(self) -> Self:
        if self.database_url_override is None and self.postgres_password is None:
            raise ValueError(
                "Defina DATABASE_URL (no Railway: referencia tipo ${{NomeDoPostgres.DATABASE_URL}}), "
                "ou PGPASSWORD/PGHOST/... referenciados do Postgres, ou POSTGRES_PASSWORD e host/porta."
            )
        return self

    @computed_field
    @property
    def database_url(self) -> str:
        """URL SQLAlchemy com driver psycopg v3."""
        if self.database_url_override:
            return _sqlalchemy_url_with_psycopg3(self.database_url_override)
        assert self.postgres_password is not None
        pw = quote_plus(self.postgres_password.get_secret_value())
        return (
            f"postgresql+psycopg://{self.postgres_user}:{pw}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
