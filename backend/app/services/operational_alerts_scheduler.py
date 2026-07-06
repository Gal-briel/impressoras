import asyncio
import logging
import os
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor


logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://saas:saas@localhost:5432/saas_platform",
)

OFFLINE_SYNC_ENABLED = os.getenv(
    "OPERATIONAL_ALERTS_OFFLINE_SYNC_ENABLED",
    "true",
).lower() in {"1", "true", "yes", "on"}

OFFLINE_SYNC_INTERVAL_SECONDS = int(
    os.getenv("OPERATIONAL_ALERTS_OFFLINE_SYNC_INTERVAL_SECONDS", "300")
)

OFFLINE_AFTER_MINUTES = int(
    os.getenv("OPERATIONAL_ALERTS_OFFLINE_AFTER_MINUTES", "15")
)

_scheduler_task: asyncio.Task | None = None


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def sync_offline_agents_once() -> dict[str, Any]:
    totals = {
        "tenants": 0,
        "opened_or_refreshed": 0,
        "resolved": 0,
    }

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT DISTINCT tenant_id
                FROM agents
                WHERE deleted_at IS NULL;
                """
            )

            tenants = cur.fetchall()

            for tenant in tenants:
                tenant_id = tenant["tenant_id"]

                cur.execute(
                    """
                    SELECT *
                    FROM sync_operational_alerts_for_offline_agents(%s, %s);
                    """,
                    (tenant_id, OFFLINE_AFTER_MINUTES),
                )

                result = cur.fetchone() or {}

                totals["tenants"] += 1
                totals["opened_or_refreshed"] += int(result.get("opened_or_refreshed") or 0)
                totals["resolved"] += int(result.get("resolved") or 0)

            conn.commit()

    return totals


async def offline_agents_scheduler_loop() -> None:
    logger.info(
        "Operational alerts offline scheduler started. interval=%ss offline_after=%smin",
        OFFLINE_SYNC_INTERVAL_SECONDS,
        OFFLINE_AFTER_MINUTES,
    )

    while True:
        try:
            result = await asyncio.to_thread(sync_offline_agents_once)

            logger.info(
                "Operational alerts offline sync finished. tenants=%s opened_or_refreshed=%s resolved=%s",
                result["tenants"],
                result["opened_or_refreshed"],
                result["resolved"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Operational alerts offline sync failed.")

        await asyncio.sleep(OFFLINE_SYNC_INTERVAL_SECONDS)


def start_operational_alerts_scheduler() -> None:
    global _scheduler_task

    if not OFFLINE_SYNC_ENABLED:
        logger.info("Operational alerts offline scheduler disabled by env.")
        return

    if _scheduler_task and not _scheduler_task.done():
        return

    _scheduler_task = asyncio.create_task(offline_agents_scheduler_loop())


async def stop_operational_alerts_scheduler() -> None:
    global _scheduler_task

    if not _scheduler_task:
        return

    _scheduler_task.cancel()

    try:
        await _scheduler_task
    except asyncio.CancelledError:
        pass

    _scheduler_task = None
    logger.info("Operational alerts offline scheduler stopped.")
