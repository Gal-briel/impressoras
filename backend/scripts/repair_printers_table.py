import asyncio

from sqlalchemy import text

import app.core.database as database


COLUMNS = [
    ("share_name", "VARCHAR(255)"),
    ("location", "VARCHAR(255)"),
    ("comment", "TEXT"),
    ("is_default", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("is_shared", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("is_network", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("is_online", "BOOLEAN"),
    ("raw_data", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
    ("last_seen_at", "TIMESTAMPTZ DEFAULT NOW()"),
    ("updated_at", "TIMESTAMPTZ DEFAULT NOW()"),
    ("created_at", "TIMESTAMPTZ DEFAULT NOW()"),
]


async def column_exists(conn, column_name: str) -> bool:
    result = await conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'printers'
                  AND column_name = :column_name
            )
            """
        ),
        {"column_name": column_name},
    )

    return bool(result.scalar())


async def main():
    engine = getattr(database, "engine", None) or getattr(database, "async_engine", None)

    if engine is None:
        raise RuntimeError("Não encontrei engine ou async_engine em app.core.database")

    async with engine.begin() as conn:
        table_exists = await conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_name = 'printers'
                )
                """
            )
        )

        if not table_exists.scalar():
            raise RuntimeError(
                "Tabela printers não existe. Rode primeiro scripts/create_printers_table.py"
            )

        for column_name, column_type in COLUMNS:
            exists = await column_exists(conn, column_name)

            if not exists:
                print(f"Adicionando coluna: {column_name}")
                await conn.execute(
                    text(f'ALTER TABLE printers ADD COLUMN {column_name} {column_type}')
                )
            else:
                print(f"Coluna já existe: {column_name}")

        for source, target in [
            ("driver_name", "driver"),
            ("port_name", "port"),
        ]:
            source_exists = await column_exists(conn, source)
            target_exists = await column_exists(conn, target)

            if source_exists and not target_exists:
                print(f"Criando coluna compatível: {target}")
                await conn.execute(text(f'ALTER TABLE printers ADD COLUMN {target} VARCHAR(255)'))
                await conn.execute(text(f'UPDATE printers SET {target} = {source} WHERE {target} IS NULL'))

            if target_exists and not source_exists:
                print(f"Criando coluna compatível: {source}")
                await conn.execute(text(f'ALTER TABLE printers ADD COLUMN {source} VARCHAR(255)'))
                await conn.execute(text(f'UPDATE printers SET {source} = {target} WHERE {source} IS NULL'))

    print("Tabela printers validada/corrigida com sucesso.")


if __name__ == "__main__":
    asyncio.run(main())
