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
    prefix="/agents/{agent_id}",
    tags=["Persisted inventory"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://saas:saas@localhost:5432/saas_platform",
)


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


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        )


def get_current_tenant_id(current_user: CurrentUser) -> str:
    return parse_uuid(str(current_user.tenant_id), "tenant_id")


def ensure_agent_access(cur, tenant_id: str, agent_id: str) -> None:
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

    if not cur.fetchone():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )


@router.get("/software-inventory")
def list_software_inventory(
    agent_id: str,
    source: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)
    agent_uuid = parse_uuid(agent_id, "agent_id")

    where = ["tenant_id = %s", "agent_id = %s"]
    params: list[Any] = [tenant_id, agent_uuid]

    if source and source != "all":
        where.append("source = %s")
        params.append(source)

    if search:
        where.append(
            """
            (
                name ILIKE %s
                OR publisher ILIKE %s
                OR version ILIKE %s
                OR source ILIKE %s
            )
            """
        )
        like = f"%{search}%"
        params.extend([like, like, like, like])

    where_sql = " AND ".join(where)

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_access(cur, tenant_id, agent_uuid)

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_software_inventory
                WHERE {where_sql};
                """,
                params,
            )
            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

            cur.execute(
                f"""
                SELECT
                    id,
                    tenant_id,
                    agent_id,
                    command_id,
                    name,
                    version,
                    publisher,
                    install_date,
                    estimated_size_mb,
                    install_location,
                    uninstall_string,
                    registry_key,
                    source,
                    user_sid,
                    collected_at,
                    created_at
                FROM agent_software_inventory
                WHERE {where_sql}
                ORDER BY name ASC, source ASC
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
        "source": source or "all",
        "search": search,
    }


@router.get("/software-inventory/sources")
def list_software_inventory_sources(
    agent_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)
    agent_uuid = parse_uuid(agent_id, "agent_id")

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_access(cur, tenant_id, agent_uuid)

            cur.execute(
                """
                SELECT
                    COALESCE(source, 'unknown') AS source,
                    COUNT(*) AS total
                FROM agent_software_inventory
                WHERE tenant_id = %s
                  AND agent_id = %s
                GROUP BY COALESCE(source, 'unknown')
                ORDER BY total DESC;
                """,
                (tenant_id, agent_uuid),
            )

            sources = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                """
                SELECT COUNT(*) AS total
                FROM agent_software_inventory
                WHERE tenant_id = %s
                  AND agent_id = %s;
                """,
                (tenant_id, agent_uuid),
            )

            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

    return {
        "items": sources,
        "total": total,
    }


@router.get("/security-snapshot/latest")
def get_latest_security_snapshot(
    agent_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)
    agent_uuid = parse_uuid(agent_id, "agent_id")

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_access(cur, tenant_id, agent_uuid)

            cur.execute(
                """
                SELECT
                    id,
                    tenant_id,
                    agent_id,
                    command_id,
                    defender,
                    antivirus,
                    bitlocker,
                    firewall,
                    hotfixes,
                    update_services,
                    local_users,
                    local_groups,
                    local_administrators,
                    usb_devices,
                    monitors,
                    recent_software,
                    security_score,
                    critical_alerts,
                    warning_alerts,
                    info_alerts,
                    collected_at,
                    created_at
                FROM agent_security_snapshots
                WHERE tenant_id = %s
                  AND agent_id = %s
                ORDER BY collected_at DESC, created_at DESC
                LIMIT 1;
                """,
                (tenant_id, agent_uuid),
            )

            row = cur.fetchone()

    if not row:
        return {
            "snapshot": None,
        }

    return {
        "snapshot": serialize_row(dict(row)),
    }


@router.get("/security-snapshots")
def list_security_snapshots(
    agent_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)
    agent_uuid = parse_uuid(agent_id, "agent_id")

    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            ensure_agent_access(cur, tenant_id, agent_uuid)

            cur.execute(
                """
                SELECT COUNT(*) AS total
                FROM agent_security_snapshots
                WHERE tenant_id = %s
                  AND agent_id = %s;
                """,
                (tenant_id, agent_uuid),
            )
            total_row = cur.fetchone()
            total = int(total_row["total"] if total_row else 0)

            cur.execute(
                """
                SELECT
                    id,
                    tenant_id,
                    agent_id,
                    command_id,
                    security_score,
                    critical_alerts,
                    warning_alerts,
                    info_alerts,
                    collected_at,
                    created_at
                FROM agent_security_snapshots
                WHERE tenant_id = %s
                  AND agent_id = %s
                ORDER BY collected_at DESC, created_at DESC
                LIMIT %s OFFSET %s;
                """,
                (tenant_id, agent_uuid, limit, offset),
            )

            items = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
