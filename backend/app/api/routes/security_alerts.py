import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2.extras import RealDictCursor

from app.core.dependencies import CurrentUser, require_permissions
from app.core.config import get_sync_database_url


router = APIRouter(
    prefix="/security-alerts",
    tags=["Security alerts"],
)



def get_connection():
    return psycopg2.connect(get_sync_database_url())


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


@router.get("/summary")
def get_security_alerts_summary(
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(DISTINCT agent_id) AS agents_with_alerts,
                    COALESCE(SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical,
                    COALESCE(SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END), 0) AS warning,
                    COALESCE(SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END), 0) AS info,
                    MAX(collected_at) AS last_collected_at
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND is_active = true;
                """,
                (tenant_id,),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    category,
                    severity,
                    COUNT(*) AS total
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND is_active = true
                GROUP BY category, severity
                ORDER BY total DESC, category ASC;
                """,
                (tenant_id,),
            )

            by_category = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                """
                SELECT
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN alerts.severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical,
                    COALESCE(SUM(CASE WHEN alerts.severity = 'warning' THEN 1 ELSE 0 END), 0) AS warning,
                    COALESCE(SUM(CASE WHEN alerts.severity = 'info' THEN 1 ELSE 0 END), 0) AS info,
                    MAX(alerts.collected_at) AS last_collected_at
                FROM agent_security_alerts alerts
                INNER JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE alerts.tenant_id = %s
                  AND alerts.is_active = true
                GROUP BY
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen
                ORDER BY critical DESC, warning DESC, total DESC, agents.hostname ASC
                LIMIT 20;
                """,
                (tenant_id,),
            )

            by_agent = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_category": by_category,
        "by_agent": by_agent,
    }


@router.get("/active")
def list_active_security_alerts(
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "alerts.tenant_id = %s",
        "alerts.is_active = true",
    ]
    params: list[Any] = [tenant_id]

    if severity and severity != "all":
        where.append("alerts.severity = %s")
        params.append(severity)

    if category and category != "all":
        where.append("alerts.category = %s")
        params.append(category)

    if search:
        where.append(
            """
            (
                alerts.title ILIKE %s
                OR alerts.description ILIKE %s
                OR alerts.category ILIKE %s
                OR agents.hostname ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_security_alerts alerts
                INNER JOIN agents
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
                    alerts.snapshot_id,
                    alerts.command_id,
                    alerts.severity,
                    alerts.title,
                    alerts.description,
                    alerts.category,
                    alerts.metadata,
                    alerts.is_active,
                    alerts.collected_at,
                    alerts.created_at
                FROM agent_security_alerts alerts
                INNER JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE alerts.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END ASC,
                    alerts.collected_at DESC,
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
        "severity": severity or "all",
        "category": category or "all",
        "search": search,
    }


def ensure_security_alert_agent_belongs_to_tenant(cur, agent_id: str, tenant_id: str) -> None:
    cur.execute(
        """
        SELECT id
        FROM agents
        WHERE id = %s
          AND tenant_id = %s
        LIMIT 1;
        """,
        (agent_id, tenant_id),
    )

    if cur.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )


@router.get("/agents/{agent_id}/summary")
def get_agent_security_alerts_summary(
    agent_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical,
                    COALESCE(SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END), 0) AS warning,
                    COALESCE(SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END), 0) AS info,
                    MAX(collected_at) AS last_collected_at
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true;
                """,
                (tenant_id, str(agent_id)),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    category,
                    severity,
                    COUNT(*) AS total
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true
                GROUP BY category, severity
                ORDER BY total DESC, severity ASC, category ASC;
                """,
                (tenant_id, str(agent_id)),
            )

            by_category = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_category": by_category,
    }


@router.get("/agents/{agent_id}/active")
def list_agent_active_security_alerts(
    agent_id: UUID,
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "alerts.tenant_id = %s",
        "alerts.agent_id = %s",
        "alerts.is_active = true",
    ]
    params: list[Any] = [tenant_id, str(agent_id)]

    if severity and severity != "all":
        where.append("alerts.severity = %s")
        params.append(severity)

    if category and category != "all":
        where.append("alerts.category = %s")
        params.append(category)

    if search:
        where.append(
            """
            (
                alerts.title ILIKE %s
                OR alerts.description ILIKE %s
                OR alerts.category ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_security_alerts alerts
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
                    alerts.snapshot_id,
                    alerts.command_id,
                    alerts.severity,
                    alerts.title,
                    alerts.description,
                    alerts.category,
                    alerts.metadata,
                    alerts.is_active,
                    alerts.collected_at,
                    alerts.created_at
                FROM agent_security_alerts alerts
                INNER JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE alerts.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END ASC,
                    alerts.collected_at DESC,
                    alerts.created_at DESC,
                    alerts.title ASC
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
        "severity": severity or "all",
        "category": category or "all",
        "search": search,
    }


def ensure_security_alert_agent_belongs_to_tenant(cur, agent_id: str, tenant_id: str) -> None:
    cur.execute(
        """
        SELECT id
        FROM agents
        WHERE id = %s
          AND tenant_id = %s
        LIMIT 1;
        """,
        (agent_id, tenant_id),
    )

    if cur.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )


@router.get("/agents/{agent_id}/summary")
def get_agent_security_alerts_summary(
    agent_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical,
                    COALESCE(SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END), 0) AS warning,
                    COALESCE(SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END), 0) AS info,
                    MAX(collected_at) AS last_collected_at
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true;
                """,
                (tenant_id, str(agent_id)),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    category,
                    severity,
                    COUNT(*) AS total
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true
                GROUP BY category, severity
                ORDER BY total DESC, severity ASC, category ASC;
                """,
                (tenant_id, str(agent_id)),
            )

            by_category = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_category": by_category,
    }


@router.get("/agents/{agent_id}/active")
def list_agent_active_security_alerts(
    agent_id: UUID,
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "alerts.tenant_id = %s",
        "alerts.agent_id = %s",
        "alerts.is_active = true",
    ]
    params: list[Any] = [tenant_id, str(agent_id)]

    if severity and severity != "all":
        where.append("alerts.severity = %s")
        params.append(severity)

    if category and category != "all":
        where.append("alerts.category = %s")
        params.append(category)

    if search:
        where.append(
            """
            (
                alerts.title ILIKE %s
                OR alerts.description ILIKE %s
                OR alerts.category ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_security_alerts alerts
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
                    alerts.snapshot_id,
                    alerts.command_id,
                    alerts.severity,
                    alerts.title,
                    alerts.description,
                    alerts.category,
                    alerts.metadata,
                    alerts.is_active,
                    alerts.collected_at,
                    alerts.created_at
                FROM agent_security_alerts alerts
                INNER JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE alerts.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END ASC,
                    alerts.collected_at DESC,
                    alerts.created_at DESC,
                    alerts.title ASC
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
        "severity": severity or "all",
        "category": category or "all",
        "search": search,
    }


def ensure_security_alert_agent_belongs_to_tenant(cur, agent_id: str, tenant_id: str) -> None:
    cur.execute(
        """
        SELECT id
        FROM agents
        WHERE id = %s
          AND tenant_id = %s
        LIMIT 1;
        """,
        (agent_id, tenant_id),
    )

    if cur.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )


@router.get("/agents/{agent_id}/summary")
def get_agent_security_alerts_summary(
    agent_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical,
                    COALESCE(SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END), 0) AS warning,
                    COALESCE(SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END), 0) AS info,
                    MAX(collected_at) AS last_collected_at
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true;
                """,
                (tenant_id, str(agent_id)),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    category,
                    severity,
                    COUNT(*) AS total
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true
                GROUP BY category, severity
                ORDER BY total DESC, severity ASC, category ASC;
                """,
                (tenant_id, str(agent_id)),
            )

            by_category = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_category": by_category,
    }


@router.get("/agents/{agent_id}/active")
def list_agent_active_security_alerts(
    agent_id: UUID,
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["security-alerts:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "alerts.tenant_id = %s",
        "alerts.agent_id = %s",
        "alerts.is_active = true",
    ]
    params: list[Any] = [tenant_id, str(agent_id)]

    if severity and severity != "all":
        where.append("alerts.severity = %s")
        params.append(severity)

    if category and category != "all":
        where.append("alerts.category = %s")
        params.append(category)

    if search:
        where.append(
            """
            (
                alerts.title ILIKE %s
                OR alerts.description ILIKE %s
                OR alerts.category ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_security_alert_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_security_alerts alerts
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
                    alerts.snapshot_id,
                    alerts.command_id,
                    alerts.severity,
                    alerts.title,
                    alerts.description,
                    alerts.category,
                    alerts.metadata,
                    alerts.is_active,
                    alerts.collected_at,
                    alerts.created_at
                FROM agent_security_alerts alerts
                INNER JOIN agents
                    ON agents.id = alerts.agent_id
                   AND agents.tenant_id = alerts.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE alerts.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END ASC,
                    alerts.collected_at DESC,
                    alerts.created_at DESC,
                    alerts.title ASC
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
        "severity": severity or "all",
        "category": category or "all",
        "search": search,
    }
