"""Reseta completamente o banco de desenvolvimento e recria dados mínimos.

Uso:
    cd backend
    PYTHONPATH=. python scripts/reset_dev_db.py

Atenção: apaga todas as tabelas do banco configurado no .env.
"""

import asyncio

from sqlalchemy import text

from app.core.database import engine
from app.infrastructure.database.base import Base
from app.infrastructure.database import models  # noqa: F401
from scripts.seed_dev_data import main as seed_dev_data


async def main() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)

        for table in Base.metadata.tables:
            await conn.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))

    await seed_dev_data()
    print("Banco de desenvolvimento resetado e populado com dados mínimos.")


if __name__ == "__main__":
    asyncio.run(main())
