from __future__ import annotations

from typing import Any

from app.core.dependencies import require_permissions
from fastapi import APIRouter, Depends, Query
from psycopg2.extras import RealDictCursor

from app.api.routes.auth import get_current_user
from app.api.routes.operational_alerts import (
    CurrentUser,
    get_connection,
    get_current_tenant_id,
    serialize_row,
)


router = APIRouter(prefix="/reports", tags=["reports"])


def serialize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [serialize_row(dict(row)) for row in rows]


@router.get("/overview")
def get_reports_overview(
    days: int = Query(default=30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_permissions(["reports:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE status = 'active') AS active,
                    count(*) FILTER (WHERE status = 'resolved') AS resolved,
                    count(*) FILTER (WHERE status = 'ignored') AS ignored,
                    count(*) FILTER (WHERE status = 'active' AND severity = 'critical') AS active_critical,
                    count(*) FILTER (WHERE status = 'active' AND severity = 'warning') AS active_warning,
                    count(*) FILTER (WHERE status = 'active' AND severity = 'info') AS active_info
                FROM operational_alerts
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            operational_alerts = dict(cur.fetchone() or {})

            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE status = 'unread') AS unread,
                    count(*) FILTER (WHERE status = 'read') AS read,
                    count(*) FILTER (WHERE status = 'archived') AS archived,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'critical') AS unread_critical,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'warning') AS unread_warning
                FROM notifications
                WHERE tenant_id = %s
                  AND deleted_at IS NULL
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            notifications = dict(cur.fetchone() or {})

            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE status IN ('success', 'completed')) AS success,
                    count(*) FILTER (WHERE status = 'failed') AS failed,
                    count(*) FILTER (WHERE status = 'timed_out') AS timed_out,
                    count(*) FILTER (WHERE status IN ('pending', 'queued')) AS pending,
                    count(*) FILTER (WHERE status IN ('running', 'in_progress')) AS running
                FROM commands
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            commands = dict(cur.fetchone() or {})

            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE is_active = true) AS active,
                    count(*) FILTER (WHERE is_active = false) AS inactive,
                    count(*) FILTER (WHERE severity = 'critical') AS critical,
                    count(*) FILTER (WHERE severity = 'warning') AS warning,
                    count(*) FILTER (WHERE severity = 'info') AS info
                FROM agent_security_alerts
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            security_alerts = dict(cur.fetchone() or {})

            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE is_active = true) AS active,
                    count(*) FILTER (WHERE is_active = false) AS inactive,
                    count(*) FILTER (WHERE change_type = 'added') AS added,
                    count(*) FILTER (WHERE change_type = 'removed') AS removed,
                    count(*) FILTER (WHERE change_type = 'changed') AS changed
                FROM agent_software_inventory_changes
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            software_changes = dict(cur.fetchone() or {})

            cur.execute(
                """
                SELECT
                    count(*) AS total,
                    count(DISTINCT user_id) AS users,
                    count(DISTINCT action) AS actions
                FROM audit_logs
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day');
                """,
                (tenant_id, days),
            )
            audit = dict(cur.fetchone() or {})

    return {
        "days": days,
        "operational_alerts": serialize_row(operational_alerts),
        "notifications": serialize_row(notifications),
        "commands": serialize_row(commands),
        "security_alerts": serialize_row(security_alerts),
        "software_changes": serialize_row(software_changes),
        "audit": serialize_row(audit),
    }


@router.get("/operational-alerts")
def get_operational_alerts_report(
    days: int = Query(default=30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_permissions(["reports:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    alert_type,
                    severity,
                    status,
                    count(*) AS total,
                    min(first_seen_at) AS first_seen_at,
                    max(last_seen_at) AS last_seen_at
                FROM operational_alerts
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day')
                GROUP BY alert_type, severity, status
                ORDER BY alert_type, severity, status;
                """,
                (tenant_id, days),
            )
            by_type = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    count(*) AS total,
                    count(*) FILTER (WHERE alerts.status = 'active') AS active,
                    count(*) FILTER (WHERE alerts.status = 'resolved') AS resolved,
                    count(*) FILTER (WHERE alerts.status = 'ignored') AS ignored,
                    count(*) FILTER (WHERE alerts.status = 'active' AND alerts.severity = 'critical') AS active_critical,
                    count(*) FILTER (WHERE alerts.status = 'active' AND alerts.severity = 'warning') AS active_warning,
                    count(*) FILTER (WHERE alerts.status = 'active' AND alerts.severity = 'info') AS active_info,
                    max(alerts.last_seen_at) AS last_alert_at
                FROM operational_alerts alerts
                LEFT JOIN agents ON agents.id = alerts.agent_id
                WHERE alerts.tenant_id = %s
                  AND alerts.created_at >= now() - (%s::int * interval '1 day')
                  AND alerts.agent_id IS NOT NULL
                GROUP BY
                    alerts.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen
                ORDER BY active DESC, total DESC, last_alert_at DESC;
                """,
                (tenant_id, days),
            )
            by_agent = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    alerts.id,
                    alerts.agent_id,
                    agents.hostname,
                    alerts.alert_type,
                    alerts.severity,
                    alerts.status,
                    alerts.title,
                    alerts.first_seen_at,
                    alerts.last_seen_at,
                    alerts.resolved_at,
                    alerts.ignored_at
                FROM operational_alerts alerts
                LEFT JOIN agents ON agents.id = alerts.agent_id
                WHERE alerts.tenant_id = %s
                  AND alerts.created_at >= now() - (%s::int * interval '1 day')
                ORDER BY alerts.last_seen_at DESC
                LIMIT 50;
                """,
                (tenant_id, days),
            )
            recent = serialize_rows(cur.fetchall())

    return {
        "days": days,
        "by_type": by_type,
        "by_agent": by_agent,
        "recent": recent,
    }


@router.get("/commands")
def get_commands_report(
    days: int = Query(default=30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_permissions(["reports:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    command_type,
                    status,
                    count(*) AS total,
                    min(created_at) AS first_created_at,
                    max(created_at) AS last_created_at
                FROM commands
                WHERE tenant_id = %s
                  AND created_at >= now() - (%s::int * interval '1 day')
                GROUP BY command_type, status
                ORDER BY command_type, status;
                """,
                (tenant_id, days),
            )
            by_type_status = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    commands.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    count(*) AS total,
                    count(*) FILTER (WHERE commands.status IN ('success', 'completed')) AS success,
                    count(*) FILTER (WHERE commands.status = 'failed') AS failed,
                    count(*) FILTER (WHERE commands.status = 'timed_out') AS timed_out,
                    max(commands.created_at) AS last_command_at
                FROM commands
                LEFT JOIN agents ON agents.id = commands.agent_id
                WHERE commands.tenant_id = %s
                  AND commands.created_at >= now() - (%s::int * interval '1 day')
                GROUP BY
                    commands.agent_id,
                    agents.hostname,
                    agents.agent_version
                ORDER BY failed DESC, timed_out DESC, total DESC, last_command_at DESC;
                """,
                (tenant_id, days),
            )
            by_agent = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    commands.id,
                    commands.agent_id,
                    agents.hostname,
                    users.email AS user_email,
                    commands.command_type,
                    commands.status,
                    commands.error_code,
                    commands.created_at,
                    commands.started_at,
                    commands.finished_at
                FROM commands
                LEFT JOIN agents ON agents.id = commands.agent_id
                LEFT JOIN users ON users.id = commands.user_id
                WHERE commands.tenant_id = %s
                  AND commands.created_at >= now() - (%s::int * interval '1 day')
                ORDER BY commands.created_at DESC
                LIMIT 50;
                """,
                (tenant_id, days),
            )
            recent = serialize_rows(cur.fetchall())

    return {
        "days": days,
        "by_type_status": by_type_status,
        "by_agent": by_agent,
        "recent": recent,
    }


@router.get("/audit-activity")
def get_audit_activity_report(
    days: int = Query(default=30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_permissions(["reports:read"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    audit_logs.action,
                    audit_logs.target_type,
                    count(*) AS total,
                    max(audit_logs.created_at) AS last_seen_at
                FROM audit_logs
                WHERE audit_logs.tenant_id = %s
                  AND audit_logs.created_at >= now() - (%s::int * interval '1 day')
                GROUP BY audit_logs.action, audit_logs.target_type
                ORDER BY total DESC, last_seen_at DESC;
                """,
                (tenant_id, days),
            )
            by_action = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    audit_logs.user_id,
                    users.email AS user_email,
                    count(*) AS total,
                    count(DISTINCT audit_logs.action) AS distinct_actions,
                    max(audit_logs.created_at) AS last_activity_at
                FROM audit_logs
                LEFT JOIN users ON users.id = audit_logs.user_id
                WHERE audit_logs.tenant_id = %s
                  AND audit_logs.created_at >= now() - (%s::int * interval '1 day')
                GROUP BY audit_logs.user_id, users.email
                ORDER BY total DESC, last_activity_at DESC;
                """,
                (tenant_id, days),
            )
            by_user = serialize_rows(cur.fetchall())

            cur.execute(
                """
                SELECT
                    audit_logs.id,
                    audit_logs.user_id,
                    users.email AS user_email,
                    audit_logs.action,
                    audit_logs.target_type,
                    audit_logs.target_id,
                    audit_logs.ip_address,
                    audit_logs.created_at
                FROM audit_logs
                LEFT JOIN users ON users.id = audit_logs.user_id
                WHERE audit_logs.tenant_id = %s
                  AND audit_logs.created_at >= now() - (%s::int * interval '1 day')
                ORDER BY audit_logs.created_at DESC
                LIMIT 100;
                """,
                (tenant_id, days),
            )
            recent = serialize_rows(cur.fetchall())

    return {
        "days": days,
        "by_action": by_action,
        "by_user": by_user,
        "recent": recent,
    }
