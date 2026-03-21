# Configuração da aplicação via variáveis de ambiente.

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração carregada de variáveis de ambiente e .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # URL do PostgreSQL; quando omitida, usa valor padrão compatível com docker-compose local.
    database_url: str = "postgresql+psycopg://valora:dev@localhost:5432/valora"
