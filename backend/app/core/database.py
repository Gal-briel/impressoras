# app/core/database.py
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.core.config import settings

class Base(DeclarativeBase):
    pass

# Engine melhorada com Pool de conexões
engine = create_async_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=False,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# Generator seguro (fecha a conexão mesmo com erro)
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Função vital para o SaaS mantida
async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    await session.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}';"))