# app/core/config.py
from typing import Optional
from urllib.parse import quote_plus

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "SaaS Platform API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Auth
    SECRET_KEY: str
    JWT_SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Agent/dev
    AGENT_API_KEY: str = "dev-agent-api-key"

    # Infra
    REDIS_URL: str
    RABBITMQ_URL: str

    # Banco de Dados
    DATABASE_URL: Optional[str] = None
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_HOST: Optional[str] = None
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """
        Retorna a URI assíncrona do PostgreSQL.

        Prioridade:
        1. DATABASE_URL, útil em produção/Supabase.
        2. POSTGRES_* do .env local, útil em desenvolvimento Docker.
        """
        if self.DATABASE_URL:
            if self.DATABASE_URL.startswith("postgresql+asyncpg://"):
                return self.DATABASE_URL

            if self.DATABASE_URL.startswith("postgresql://"):
                return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

            return self.DATABASE_URL

        server = self.POSTGRES_SERVER or self.POSTGRES_HOST

        if not server:
            raise ValueError("POSTGRES_SERVER or POSTGRES_HOST must be configured")

        db_name = self.POSTGRES_DB.lstrip("/")

        return (
            "postgresql+asyncpg://"
            f"{self.POSTGRES_USER}:{quote_plus(self.POSTGRES_PASSWORD)}"
            f"@{server}:{self.POSTGRES_PORT}/{db_name}"
        )

    @computed_field
    @property
    def DATABASE_URI(self) -> str:
        """
        Alias de compatibilidade para qualquer parte do projeto que use DATABASE_URI.
        """
        return self.SQLALCHEMY_DATABASE_URI

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
