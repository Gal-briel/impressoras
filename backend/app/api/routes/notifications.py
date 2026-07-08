from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.dependencies import require_permissions
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg2.extras import RealDictCursor

from app.api.routes.operational_alerts import (
    CurrentUser,
    get_connection,
    get_current_tenant_id,
    serialize_row,
)
from app.api.routes.auth import get_current_user


router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_current_user_id(current_user: CurrentUser) -> str | None:
    if isinstance(current_user, dict):
        value = (
            current_user.get("id")
            or current_user.get("user_id")
            or current_user.get("sub")
        )
        return str(value) if value else None

    value = (
        getattr(current_user, "id", None)
        or getattr(current_user, "user_id", None)
        or getattr(current_user, "sub", None)
    )

    return str(value) if value else None


def serialize_notification(row: dict[str, Any] | None):
    if not row:
        return None

    return serialize_row(dict(row))


@router.get("/summary")
def get_notifications_summary(
    current_user: CurrentUser = Depends(require_permissions(["notifications:read"])),
):
    tenant_id = get_current_tenant_id(current_user)
    user_id = get_current_user_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    count(*) FILTER (WHERE status = 'unread') AS unread_total,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'critical') AS unread_critical,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'warning') AS unread_warning,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'info') AS unread_info,
                    count(*) FILTER (WHERE status = 'unread' AND severity = 'success') AS unread_success,
                    count(*) FILTER (WHERE status = 'read') AS read_total,
                    count(*) FILTER (WHERE status = 'archived') AS archived_total,
                    count(*) AS total,
                    max(created_at) AS last_notification_at
                FROM notifications
                WHERE tenant_id = %s
                  AND deleted_at IS NULL
                  AND (
                    user_id IS NULL
                    OR user_id = %s
                  );
                """,
                (tenant_id, user_id),
            )

            summary = cur.fetchone() or {}

    return {
        "summary": serialize_row(dict(summary)),
    }


@router.get("")
def list_notifications(
    status: str = Query(default="unread"),
    severity: str = Query(default="all"),
    notification_type: str = Query(default="all"),
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_permissions(["notifications:read"])),
):
    tenant_id = get_current_tenant_id(current_user)
    user_id = get_current_user_id(current_user)

    where = [
        "tenant_id = %s",
        "deleted_at IS NULL",
        "(user_id IS NULL OR user_id = %s)",
    ]
    params: list[Any] = [tenant_id, user_id]

    if status != "all":
        where.append("status = %s")
        params.append(status)

    if severity != "all":
        where.append("severity = %s")
        params.append(severity)

    if notification_type != "all":
        where.append("notification_type = %s")
        params.append(notification_type)

    if search:
        where.append("(title ILIKE %s OR message ILIKE %s)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT count(*) AS total
                FROM notifications
                WHERE {where_sql};
                """,
                params,
            )
            total = int((cur.fetchone() or {}).get("total") or 0)

            cur.execute(
                f"""
                SELECT
                    id,
                    tenant_id,
                    user_id,
                    channel,
                    notification_type,
                    severity,
                    status,
                    title,
                    message,
                    action_url,
                    source_type,
                    source_id,
                    dedupe_key,
                    metadata,
                    read_at,
                    archived_at,
                    created_at,
                    updated_at
                FROM notifications
                WHERE {where_sql}
                ORDER BY created_at DESC
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
        "status": status,
        "severity": severity,
        "notification_type": notification_type,
        "search": search,
    }


@router.post("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["notifications:write"])),
):
    tenant_id = get_current_tenant_id(current_user)
    user_id = get_current_user_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET
                    status = 'read',
                    read_at = COALESCE(read_at, now())
                WHERE tenant_id = %s
                  AND id = %s
                  AND deleted_at IS NULL
                  AND (
                    user_id IS NULL
                    OR user_id = %s
                  )
                RETURNING *;
                """,
                (tenant_id, str(notification_id), user_id),
            )

            row = cur.fetchone()
            conn.commit()

    notification = serialize_notification(row)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return notification


@router.post("/{notification_id}/archive")
def archive_notification_by_id(
    notification_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["notifications:write"])),
):
    tenant_id = get_current_tenant_id(current_user)
    user_id = get_current_user_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET
                    status = 'archived',
                    read_at = COALESCE(read_at, now()),
                    archived_at = COALESCE(archived_at, now())
                WHERE tenant_id = %s
                  AND id = %s
                  AND deleted_at IS NULL
                  AND (
                    user_id IS NULL
                    OR user_id = %s
                  )
                RETURNING *;
                """,
                (tenant_id, str(notification_id), user_id),
            )

            row = cur.fetchone()
            conn.commit()

    notification = serialize_notification(row)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return notification


@router.post("/read-all")
def mark_all_notifications_as_read(
    current_user: CurrentUser = Depends(require_permissions(["notifications:write"])),
):
    tenant_id = get_current_tenant_id(current_user)
    user_id = get_current_user_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET
                    status = 'read',
                    read_at = COALESCE(read_at, now())
                WHERE tenant_id = %s
                  AND status = 'unread'
                  AND deleted_at IS NULL
                  AND (
                    user_id IS NULL
                    OR user_id = %s
                  )
                RETURNING id;
                """,
                (tenant_id, user_id),
            )

            rows = cur.fetchall()
            conn.commit()

    return {
        "updated": len(rows),
    }


@router.post("/sync/operational-alerts")
def sync_operational_alert_notifications(
    current_user: CurrentUser = Depends(require_permissions(["notifications:write"])),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM sync_notifications_from_active_operational_alerts(%s);
                """,
                (tenant_id,),
            )

            row = cur.fetchone() or {}
            conn.commit()

    return serialize_row(dict(row))
