"""Cria as tabelas em ambiente local de desenvolvimento sem depender das migrations incompletas do handoff.

Uso:
    cd backend
    python scripts/init_dev_db.py
"""
import asyncio

from sqlalchemy import text

from app.core.database import engine
from app.infrastructure.database.base import Base
from app.infrastructure.database import models  # noqa: F401


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Em dev local, mantemos RLS desligado para facilitar testes via Swagger/seed.
        for table in [
            "roles",
            "users",
            "agent_groups",
            "agent_tags",
            "agent_tag_assignments",
            "agents",
            "printers",
            "commands",
            "command_results",
            "audit_logs",
            "agent_events",
        ]:
            await conn.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))

    print("Banco local inicializado com Base.metadata.create_all().")


if __name__ == "__main__":
    asyncio.run(main())
