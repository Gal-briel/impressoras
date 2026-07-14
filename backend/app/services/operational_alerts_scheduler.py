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


def _empty_sync_result() -> dict[str, int]:
    return {
        "opened_or_refreshed": 0,
        "resolved": 0,
    }


def _empty_notification_sync_result() -> dict[str, int]:
    return {
        "opened_or_refreshed": 0,
        "archived": 0,
    }


def _normalize_sync_result(row: dict[str, Any] | None) -> dict[str, int]:
    row = row or {}

    return {
        "opened_or_refreshed": int(row.get("opened_or_refreshed") or 0),
        "resolved": int(row.get("resolved") or 0),
    }


def _normalize_notification_sync_result(row: dict[str, Any] | None) -> dict[str, int]:
    row = row or {}

    return {
        "opened_or_refreshed": int(row.get("opened_or_refreshed") or 0),
        "archived": int(row.get("archived") or 0),
    }


def sync_operational_alerts_once() -> dict[str, Any]:
    totals: dict[str, Any] = {
        "tenants": 0,
        "offline_agents": _empty_sync_result(),
        "security_alerts": _empty_sync_result(),
        "software_changes": _empty_sync_result(),
        "notifications": _empty_notification_sync_result(),
        "totals": _empty_sync_result(),
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
                offline_result = _normalize_sync_result(cur.fetchone())

                cur.execute(
                    """
                    SELECT *
                    FROM sync_operational_alerts_from_active_security_alerts(%s);
                    """,
                    (tenant_id,),
                )
                security_result = _normalize_sync_result(cur.fetchone())

                cur.execute(
                    """
                    SELECT *
                    FROM sync_operational_alerts_from_active_software_changes(%s);
                    """,
                    (tenant_id,),
                )
                software_result = _normalize_sync_result(cur.fetchone())

                cur.execute(
                    """
                    SELECT *
                    FROM sync_notifications_from_active_operational_alerts(%s);
                    """,
                    (tenant_id,),
                )
                notification_result = _normalize_notification_sync_result(cur.fetchone())

                totals["tenants"] += 1

                for key in ("opened_or_refreshed", "resolved"):
                    totals["offline_agents"][key] += offline_result[key]
                    totals["security_alerts"][key] += security_result[key]
                    totals["software_changes"][key] += software_result[key]
                    totals["totals"][key] += (
                        offline_result[key]
                        + security_result[key]
                        + software_result[key]
                    )

                for key in ("opened_or_refreshed", "archived"):
                    totals["notifications"][key] += notification_result[key]

            conn.commit()

    return totals


def sync_offline_agents_once() -> dict[str, Any]:
    """Compatibilidade com o nome usado nas sprints anteriores.

    A partir da Sprint 22.11, esta função executa a sincronização operacional
    completa. A partir da Sprint 23.6, também reconcilia notificações internas.
    """
    return sync_operational_alerts_once()


async def offline_agents_scheduler_loop() -> None:
    logger.info(
        "Operational alerts scheduler started. interval=%ss offline_after=%smin",
        OFFLINE_SYNC_INTERVAL_SECONDS,
        OFFLINE_AFTER_MINUTES,
    )

    while True:
        try:
            result = await asyncio.to_thread(sync_operational_alerts_once)

            logger.info(
                "Operational alerts sync finished. "
                "tenants=%s "
                "offline_opened_or_refreshed=%s offline_resolved=%s "
                "security_opened_or_refreshed=%s security_resolved=%s "
                "software_opened_or_refreshed=%s software_resolved=%s "
                "notifications_opened_or_refreshed=%s notifications_archived=%s "
                "total_opened_or_refreshed=%s total_resolved=%s",
                result["tenants"],
                result["offline_agents"]["opened_or_refreshed"],
                result["offline_agents"]["resolved"],
                result["security_alerts"]["opened_or_refreshed"],
                result["security_alerts"]["resolved"],
                result["software_changes"]["opened_or_refreshed"],
                result["software_changes"]["resolved"],
                result["notifications"]["opened_or_refreshed"],
                result["notifications"]["archived"],
                result["totals"]["opened_or_refreshed"],
                result["totals"]["resolved"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Operational alerts sync failed.")

        await asyncio.sleep(OFFLINE_SYNC_INTERVAL_SECONDS)


def start_operational_alerts_scheduler() -> None:
    global _scheduler_task

    if not OFFLINE_SYNC_ENABLED:
        logger.info("Operational alerts scheduler disabled by env.")
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
    logger.info("Operational alerts scheduler stopped.")
