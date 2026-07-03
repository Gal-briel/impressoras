import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2.extras import RealDictCursor

from app.core.dependencies import CurrentUser, get_current_user


router = APIRouter(
    prefix="/software-inventory/changes",
    tags=["Software inventory changes"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://saas:saas@localhost:5432/saas_platform",
)


def get_connection():
    return psycopg2.connect(DATABASE_URL)


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
def get_software_inventory_changes_summary(
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(DISTINCT agent_id) AS agents_with_changes,
                    COALESCE(SUM(CASE WHEN change_type = 'added' THEN 1 ELSE 0 END), 0) AS added,
                    COALESCE(SUM(CASE WHEN change_type = 'removed' THEN 1 ELSE 0 END), 0) AS removed,
                    COALESCE(SUM(CASE WHEN change_type = 'changed' THEN 1 ELSE 0 END), 0) AS changed,
                    MAX(collected_at) AS last_collected_at
                FROM agent_software_inventory_changes
                WHERE tenant_id = %s
                  AND is_active = true;
                """,
                (tenant_id,),
            )

            summary = serialize_row(dict(cur.fetchone() or {}))

            cur.execute(
                """
                SELECT
                    change_type,
                    source,
                    COUNT(*) AS total
                FROM agent_software_inventory_changes
                WHERE tenant_id = %s
                  AND is_active = true
                GROUP BY change_type, source
                ORDER BY total DESC, change_type ASC, source ASC;
                """,
                (tenant_id,),
            )

            by_source = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                """
                SELECT
                    changes.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN changes.change_type = 'added' THEN 1 ELSE 0 END), 0) AS added,
                    COALESCE(SUM(CASE WHEN changes.change_type = 'removed' THEN 1 ELSE 0 END), 0) AS removed,
                    COALESCE(SUM(CASE WHEN changes.change_type = 'changed' THEN 1 ELSE 0 END), 0) AS changed,
                    MAX(changes.collected_at) AS last_collected_at
                FROM agent_software_inventory_changes changes
                INNER JOIN agents
                    ON agents.id = changes.agent_id
                   AND agents.tenant_id = changes.tenant_id
                WHERE changes.tenant_id = %s
                  AND changes.is_active = true
                GROUP BY
                    changes.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen
                ORDER BY total DESC, agents.hostname ASC
                LIMIT 20;
                """,
                (tenant_id,),
            )

            by_agent = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_source": by_source,
        "by_agent": by_agent,
    }


@router.get("/active")
def list_active_software_inventory_changes(
    change_type: str | None = Query(default=None),
    source: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "changes.tenant_id = %s",
        "changes.is_active = true",
    ]
    params: list[Any] = [tenant_id]

    if change_type and change_type != "all":
        where.append("changes.change_type = %s")
        params.append(change_type)

    if source and source != "all":
        where.append("changes.source = %s")
        params.append(source)

    if search:
        where.append(
            """
            (
                changes.name ILIKE %s
                OR changes.publisher ILIKE %s
                OR changes.source ILIKE %s
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
                FROM agent_software_inventory_changes changes
                INNER JOIN agents
                    ON agents.id = changes.agent_id
                   AND agents.tenant_id = changes.tenant_id
                WHERE {where_sql};
                """,
                params,
            )

            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

            cur.execute(
                f"""
                SELECT
                    changes.id,
                    changes.tenant_id,
                    changes.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    changes.snapshot_id,
                    changes.previous_snapshot_id,
                    changes.command_id,
                    changes.change_type,
                    changes.name,
                    changes.publisher,
                    changes.source,
                    changes.previous_version,
                    changes.latest_version,
                    changes.previous_install_date,
                    changes.latest_install_date,
                    changes.previous_install_location,
                    changes.latest_install_location,
                    changes.metadata,
                    changes.is_active,
                    changes.collected_at,
                    changes.created_at
                FROM agent_software_inventory_changes changes
                INNER JOIN agents
                    ON agents.id = changes.agent_id
                   AND agents.tenant_id = changes.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE changes.change_type
                        WHEN 'added' THEN 1
                        WHEN 'removed' THEN 2
                        ELSE 3
                    END ASC,
                    changes.collected_at DESC,
                    changes.created_at DESC,
                    changes.name ASC
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
        "change_type": change_type or "all",
        "source": source or "all",
        "search": search,
    }


def ensure_agent_belongs_to_tenant(cur, agent_id: str, tenant_id: str) -> None:
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
def get_agent_software_inventory_changes_summary(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN change_type = 'added' THEN 1 ELSE 0 END), 0) AS added,
                    COALESCE(SUM(CASE WHEN change_type = 'removed' THEN 1 ELSE 0 END), 0) AS removed,
                    COALESCE(SUM(CASE WHEN change_type = 'changed' THEN 1 ELSE 0 END), 0) AS changed,
                    MAX(collected_at) AS last_collected_at
                FROM agent_software_inventory_changes
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
                    change_type,
                    source,
                    COUNT(*) AS total
                FROM agent_software_inventory_changes
                WHERE tenant_id = %s
                  AND agent_id = %s
                  AND is_active = true
                GROUP BY change_type, source
                ORDER BY total DESC, change_type ASC, source ASC;
                """,
                (tenant_id, str(agent_id)),
            )

            by_source = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "summary": summary,
        "by_source": by_source,
    }


@router.get("/agents/{agent_id}/active")
def list_agent_active_software_inventory_changes(
    agent_id: UUID,
    change_type: str | None = Query(default=None),
    source: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)

    where = [
        "changes.tenant_id = %s",
        "changes.agent_id = %s",
        "changes.is_active = true",
    ]
    params: list[Any] = [tenant_id, str(agent_id)]

    if change_type and change_type != "all":
        where.append("changes.change_type = %s")
        params.append(change_type)

    if source and source != "all":
        where.append("changes.source = %s")
        params.append(source)

    if search:
        where.append(
            """
            (
                changes.name ILIKE %s
                OR changes.publisher ILIKE %s
                OR changes.source ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_belongs_to_tenant(cur, str(agent_id), tenant_id)

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_software_inventory_changes changes
                WHERE {where_sql};
                """,
                params,
            )

            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

            cur.execute(
                f"""
                SELECT
                    changes.id,
                    changes.tenant_id,
                    changes.agent_id,
                    agents.hostname,
                    agents.agent_version,
                    agents.last_seen,
                    changes.snapshot_id,
                    changes.previous_snapshot_id,
                    changes.command_id,
                    changes.change_type,
                    changes.name,
                    changes.publisher,
                    changes.source,
                    changes.previous_version,
                    changes.latest_version,
                    changes.previous_install_date,
                    changes.latest_install_date,
                    changes.previous_install_location,
                    changes.latest_install_location,
                    changes.metadata,
                    changes.is_active,
                    changes.collected_at,
                    changes.created_at
                FROM agent_software_inventory_changes changes
                INNER JOIN agents
                    ON agents.id = changes.agent_id
                   AND agents.tenant_id = changes.tenant_id
                WHERE {where_sql}
                ORDER BY
                    CASE changes.change_type
                        WHEN 'added' THEN 1
                        WHEN 'removed' THEN 2
                        ELSE 3
                    END ASC,
                    changes.collected_at DESC,
                    changes.created_at DESC,
                    changes.name ASC
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
        "change_type": change_type or "all",
        "source": source or "all",
        "search": search,
    }
