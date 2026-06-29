import asyncio

from app.infrastructure.database.models import Base
import app.core.database as database


async def main():
    engine = getattr(database, "engine", None) or getattr(database, "async_engine", None)

    if engine is None:
        raise RuntimeError("Não encontrei engine ou async_engine em app.core.database")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Tabela printers criada/validada com sucesso.")


if __name__ == "__main__":
    asyncio.run(main())
