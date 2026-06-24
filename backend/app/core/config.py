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

    # Infra
    REDIS_URL: str
    RABBITMQ_URL: str

    # Banco de Dados
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
        Monta a URI do PostgreSQL sem duplicar '/' antes do nome do banco.

        Exemplo correto:
        postgresql+asyncpg://saas:saas@localhost:5432/saas_platform
        """
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
