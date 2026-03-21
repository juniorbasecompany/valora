# Configuração da aplicação via variáveis de ambiente.

from urllib.parse import quote_plus

from pydantic import AliasChoices, Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração carregada de variáveis de ambiente e `.env`."""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = "localhost"
    postgres_port: int = 5434
    postgres_user: str = "valora"
    postgres_db: str = "valora"
    postgres_password: SecretStr = Field(
        validation_alias=AliasChoices("POSTGRES_PASSWORD", "postgres_password"),
    )

    @computed_field
    @property
    def database_url(self) -> str:
        """URL SQLAlchemy/psycopg; a senha vem só de `POSTGRES_PASSWORD` (nunca hardcoded)."""
        pw = quote_plus(self.postgres_password.get_secret_value())
        return (
            f"postgresql+psycopg://{self.postgres_user}:{pw}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
