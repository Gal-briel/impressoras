import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2.extras import Json, RealDictCursor
from pydantic import BaseModel

from app.core.dependencies import CurrentUser, get_current_user, require_permissions


def get_sync_database_url() -> str:
    database_url = (
        os.getenv("SYNC_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or ""
    )

    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    if not database_url:
        raise RuntimeError("Database URL not configured. Set SYNC_DATABASE_URL or DATABASE_URL.")

    return database_url


def get_connection():
    return psycopg2.connect(get_sync_database_url())


router = APIRouter(
    prefix="/operational-alerts",
    tags=["Operational alerts"],
)


class AlertActionPayload(BaseModel):
    note: str | None = None



def serialize_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, list):
        return [serialize_value(item) for item in value]

    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}

    return value


def serialize_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None

    return {key: serialize_value(value) for key, value in row.items()}


def get_current_tenant_id(current_user: CurrentUser) -> str:
    try:
        return str(UUID(str(current_user.tenant_id)))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid tenant_id",
        )


def get_alert_or_404(cur, tenant_id: str, alert_id: str) -> dict[str, Any]:
    cur.execute(
        """
        SELECT
            alerts.id,
            alerts.tenant_id,
            alerts.agent_id,
            agents.hostname,
            agents.agent_version,
            agents.last_seen,
            alerts.alert_type,
            alerts.severity,
            alerts.status,
            alerts.title,
            alerts.description,
            alerts.source_type,
            alerts.source_id,
            alerts.dedupe_key,
            alerts.metadata,
            alerts.first_seen_at,
            alerts.last_seen_at,
            alerts.resolved_at,
            alerts.ignored_at,
            alerts.created_at,
            alerts.updated_at
        FROM operational_alerts alerts
        LEFT JOIN agents
            ON agents.id = alerts.agent_id
           AND agents.tenant_id = alerts.tenant_id
        WHERE alerts.tenant_id = %s
          AND alerts.id = %s
        LIMIT 1;
        """,
        (tenant_id, alert_id),
    )

    row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operational alert not found",
        )

    return dict(row)


@router.get("/summary")
def get_operational_alerts_summary(
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                    COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) AS resolved,
                    COALESCE(SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END), 0) AS ignored,
                    COALESCE(SUM(CASE WHEN status = 'active' AND severity = 'critical' THEN 1 ELSE 0 END), 0) AS active_critical,
                    COALESCE(SUM(CASE WHEN status = 'active' AND severity = 'warning' THEN 1 ELSE 0 END), 0) AS active_warning,
                    COALESCE(SUM(CASE WHEN status = 'active' AND severity = 'info' THEN 1 ELSE 0 END), 0) AS active_info,
                    COUNT(DISTINCT CASE WHEN status = 'active' THEN agent_id END) AS agents_with_active_alerts,
                    MAX(last_seen_at) AS last_seen_at
                FROM operational_alerts
                WHERE tenant_id = %s;
                """,
                (tenant_id,),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    alert_type,
                    severity,
                    status,
                    COUNT(*) AS total
                FROM operational_alerts
                WHERE tenant_id = %s
                GROUP BY alert_type, severity, status
                ORDER BY status ASC, total DESC, alert_type ASC;
                """,
                (tenant_id,),
            )

            by_type = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                """
                SELECT
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN alerts.status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                    COALESCE(SUM(CASE WHEN alerts.status = 'resolved' THEN 1 ELSE 0 END), 0) AS resolved,
                    COALESCE(SUM(CASE WHEN alerts.status = 'ignored' THEN 1 ELSE 0 END), 0) AS ignored,
                    COALESCE(SUM(CASE WHEN alerts.status = 'active' AND alerts.severity = 'critical' THEN 1 ELSE 0 END), 0) AS active_critical,
                    COALESCE(SUM(CASE WHEN alerts.status = 'active' AND alerts.severity = 'warning' THEN 1 ELSE 0 END), 0) AS active_warning,
                    COALESCE(SUM(CASE WHEN alerts.status = 'active' AND alerts.severity = 'info' THEN 1 ELSE 0 END), 0) AS active_info,
                    MAX(alerts.last_seen_at) AS last_seen_at
                FROM operational_alerts alerts
                LEFT JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE alerts.tenant_id = %s
                  AND alerts.agent_id IS NOT NULL
                GROUP BY
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen
                ORDER BY active DESC, total DESC, agents.hostname ASC
                LIMIT 20;
                """,
                (tenant_id,),
            )

            by_agent = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_type": by_type,
        "by_agent": by_agent,
    }


@router.get("")
def list_operational_alerts(
    status_filter: str | None = Query(default="active", alias="status"),
    severity: str | None = Query(default="all"),
    alert_type: str | None = Query(default="all"),
    agent_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    where = ["alerts.tenant_id = %s"]
    params: list[Any] = [tenant_id]

    if status_filter and status_filter != "all":
        where.append("alerts.status = %s")
        params.append(status_filter)

    if severity and severity != "all":
        where.append("alerts.severity = %s")
        params.append(severity)

    if alert_type and alert_type != "all":
        where.append("alerts.alert_type = %s")
        params.append(alert_type)

    if agent_id:
        where.append("alerts.agent_id = %s")
        params.append(str(agent_id))

    if search:
        where.append(
            """
            (
                alerts.title ILIKE %s
                OR alerts.description ILIKE %s
                OR alerts.alert_type ILIKE %s
                OR alerts.dedupe_key ILIKE %s
                OR agents.hostname ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM operational_alerts alerts
                LEFT JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql};
                """,
                params,
            )

            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

            cur.execute(
                f"""
                SELECT
                    alerts.id,
                    alerts.tenant_id,
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    alerts.alert_type,
                    alerts.severity,
                    alerts.status,
                    alerts.title,
                    alerts.description,
                    alerts.source_type,
                    alerts.source_id,
                    alerts.dedupe_key,
                    alerts.metadata,
                    alerts.first_seen_at,
                    alerts.last_seen_at,
                    alerts.resolved_at,
                    alerts.ignored_at,
                    alerts.created_at,
                    alerts.updated_at
                FROM operational_alerts alerts
                LEFT JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE alerts.status
                        WHEN 'active' THEN 1
                        WHEN 'ignored' THEN 2
                        ELSE 3
                    END ASC,
                    CASE alerts.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END ASC,
                    alerts.last_seen_at DESC,
                    alerts.created_at DESC
                LIMIT %s OFFSET %s;
                """,
                params + [limit, offset],
            )

            items = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "status": status_filter or "active",
        "severity": severity or "all",
        "alert_type": alert_type or "all",
        "agent_id": str(agent_id) if agent_id else None,
        "search": search,
    }


@router.get("/{alert_id}")
def get_operational_alert(
    alert_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            alert = get_alert_or_404(cur, tenant_id, str(alert_id))

    return serialize_row(alert)


@router.post("/{alert_id}/resolve")
def resolve_operational_alert(
    alert_id: UUID,
    payload: AlertActionPayload | None = None,
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)
    note = payload.note if payload else None

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            get_alert_or_404(cur, tenant_id, str(alert_id))

            cur.execute(
                """
                UPDATE operational_alerts
                SET
                    status = 'resolved',
                    resolved_at = now(),
                    ignored_at = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('resolved_note', %s)
                WHERE tenant_id = %s
                  AND id = %s
                RETURNING
                    id,
                    tenant_id,
                    agent_id,
                    alert_type,
                    severity,
                    status,
                    title,
                    description,
                    source_type,
                    source_id,
                    dedupe_key,
                    metadata,
                    first_seen_at,
                    last_seen_at,
                    resolved_at,
                    ignored_at,
                    created_at,
                    updated_at;
                """,
                (note, tenant_id, str(alert_id)),
            )

            row = cur.fetchone()
            conn.commit()

    return serialize_row(dict(row))


@router.post("/{alert_id}/ignore")
def ignore_operational_alert(
    alert_id: UUID,
    payload: AlertActionPayload | None = None,
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)
    note = payload.note if payload else None

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            get_alert_or_404(cur, tenant_id, str(alert_id))

            cur.execute(
                """
                UPDATE operational_alerts
                SET
                    status = 'ignored',
                    ignored_at = now(),
                    resolved_at = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ignored_note', %s)
                WHERE tenant_id = %s
                  AND id = %s
                RETURNING
                    id,
                    tenant_id,
                    agent_id,
                    alert_type,
                    severity,
                    status,
                    title,
                    description,
                    source_type,
                    source_id,
                    dedupe_key,
                    metadata,
                    first_seen_at,
                    last_seen_at,
                    resolved_at,
                    ignored_at,
                    created_at,
                    updated_at;
                """,
                (note, tenant_id, str(alert_id)),
            )

            row = cur.fetchone()
            conn.commit()

    return serialize_row(dict(row))


@router.post("/sync/offline-agents")
def sync_offline_agent_alerts(
    offline_after_minutes: int = Query(default=15, ge=1, le=1440),
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_for_offline_agents(%s, %s);
                """,
                (tenant_id, offline_after_minutes),
            )

            row = cur.fetchone()
            conn.commit()

    return serialize_row(dict(row))


@router.post("/sync/security-alerts")
def sync_security_operational_alerts(
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_from_active_security_alerts(%s);
                """,
                (tenant_id,),
            )

            row = cur.fetchone()
            conn.commit()

    return serialize_row(dict(row))


@router.post("/sync/software-changes")
def sync_software_change_operational_alerts(
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_from_active_software_changes(%s);
                """,
                (tenant_id,),
            )

            row = cur.fetchone()
            conn.commit()

    return serialize_row(dict(row))


@router.post("/sync/all")
def sync_all_operational_alerts(
    offline_after_minutes: int = 15,
    current_user: CurrentUser = Depends(require_permissions(["operational-alerts:write"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_for_offline_agents(%s, %s);
                """,
                (tenant_id, offline_after_minutes),
            )
            offline_result = dict(cur.fetchone())

            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_from_active_security_alerts(%s);
                """,
                (tenant_id,),
            )
            security_result = dict(cur.fetchone())

            cur.execute(
                """
                SELECT *
                FROM sync_operational_alerts_from_active_software_changes(%s);
                """,
                (tenant_id,),
            )
            software_result = dict(cur.fetchone())

            conn.commit()

    total_opened_or_refreshed = (
        int(offline_result.get("opened_or_refreshed") or 0)
        + int(security_result.get("opened_or_refreshed") or 0)
        + int(software_result.get("opened_or_refreshed") or 0)
    )

    total_resolved = (
        int(offline_result.get("resolved") or 0)
        + int(security_result.get("resolved") or 0)
        + int(software_result.get("resolved") or 0)
    )

    return {
        "offline_agents": serialize_row(offline_result),
        "security_alerts": serialize_row(security_result),
        "software_changes": serialize_row(software_result),
        "totals": {
            "opened_or_refreshed": total_opened_or_refreshed,
            "resolved": total_resolved,
        },
    }
