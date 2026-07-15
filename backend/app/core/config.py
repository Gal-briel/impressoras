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
    AGENT_API_KEY: str | None = None

    # Infra
    REDIS_URL: str
    RABBITMQ_URL: str

    # Agent update packages
    AGENT_PACKAGE_ALLOWED_HOSTS: str = "riverbank-class-licorice.ngrok-free.dev,localhost,127.0.0.1"

    # Rate limit
    RATE_LIMIT_LOGIN_MAX_ATTEMPTS: int = 10
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = 300
    RATE_LIMIT_REFRESH_MAX_ATTEMPTS: int = 30
    RATE_LIMIT_REFRESH_WINDOW_SECONDS: int = 300
    RATE_LIMIT_ENROLLMENT_MAX_ATTEMPTS: int = 5
    RATE_LIMIT_ENROLLMENT_WINDOW_SECONDS: int = 600

    # CORS
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )
    CORS_ALLOW_CREDENTIALS: bool = True

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
    def JWT_SIGNING_KEY(self) -> str:
        """Chave usada exclusivamente para assinar/validar JWT.

        Em desenvolvimento, permite fallback para SECRET_KEY para facilitar ambiente local.
        Em produção, validate_runtime_security exige JWT_SECRET_KEY forte.
        """
        return str(self.JWT_SECRET_KEY or self.SECRET_KEY or "").strip()

    @computed_field
    @property
    def CORS_ORIGINS(self) -> list[str]:
        """Lista de origens permitidas para CORS.

        Use BACKEND_CORS_ORIGINS no .env separado por vírgula.
        Exemplo:
        BACKEND_CORS_ORIGINS=https://painel.exemplo.com,http://localhost:5173
        """
        origins: list[str] = []

        for raw_origin in str(self.BACKEND_CORS_ORIGINS or "").split(","):
            origin = raw_origin.strip().rstrip("/")

            if origin:
                origins.append(origin)

        return origins

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


def get_sync_database_url() -> str:
    """Retorna URL síncrona compatível com psycopg2.

    Prioridade:
    1. SYNC_DATABASE_URL
    2. DATABASE_URL convertido de postgresql+asyncpg:// para postgresql://
    3. settings.SQLALCHEMY_DATABASE_URI convertido
    """
    import os

    sync_url = os.getenv("SYNC_DATABASE_URL")
    if sync_url:
        return sync_url.replace("postgresql+asyncpg://", "postgresql://")

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url.replace("postgresql+asyncpg://", "postgresql://")

    return str(settings.SQLALCHEMY_DATABASE_URI).replace(
        "postgresql+asyncpg://",
        "postgresql://",
    )




def validate_runtime_security() -> None:
    """Bloqueia inicialização insegura em produção."""
    import os

    environment = (
        os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or os.getenv("PYTHON_ENV")
        or "development"
    ).strip().lower()

    if environment not in {"production", "prod"}:
        return

    secret_key = str(settings.SECRET_KEY or "").strip()
    jwt_secret_key = str(getattr(settings, "JWT_SECRET_KEY", "") or "").strip()
    database_url = str(settings.DATABASE_URL or "").strip()

    weak_values = {
        "",
        "change-me",
        "changeme",
        "secret",
        "dev",
        "development",
        "troque-esta-chave-em-producao",
        "super-secret-key",
        "your-secret-key",
    }

    if secret_key.lower() in weak_values or len(secret_key) < 32:
        raise RuntimeError("Configuração insegura: SECRET_KEY forte é obrigatória em produção.")

    if jwt_secret_key.lower() in weak_values or len(jwt_secret_key) < 32:
        raise RuntimeError("Configuração insegura: JWT_SECRET_KEY forte é obrigatória em produção.")

    if not database_url:
        raise RuntimeError("Configuração insegura: DATABASE_URL é obrigatório em produção.")

    if "localhost" in database_url or "127.0.0.1" in database_url:
        raise RuntimeError("Configuração insegura: DATABASE_URL local não é permitido em produção.")

    cors_origins = list(getattr(settings, "CORS_ORIGINS", []) or [])

    if not cors_origins:
        raise RuntimeError("Configuração insegura: BACKEND_CORS_ORIGINS é obrigatório em produção.")

    if "*" in cors_origins:
        raise RuntimeError("Configuração insegura: CORS com '*' não é permitido em produção.")
