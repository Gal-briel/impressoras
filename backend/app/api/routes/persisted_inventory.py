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


@router.get("/software-inventory/snapshots")
def list_software_inventory_snapshots(
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
                FROM agent_software_inventory_snapshots
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
                    total_items,
                    sources,
                    raw_counts,
                    collection_mode,
                    collected_at,
                    created_at
                FROM agent_software_inventory_snapshots
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


@router.get("/software-inventory/snapshots/{snapshot_id}/items")
def list_software_inventory_snapshot_items(
    agent_id: str,
    snapshot_id: str,
    source: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id(current_user)
    agent_uuid = parse_uuid(agent_id, "agent_id")
    snapshot_uuid = parse_uuid(snapshot_id, "snapshot_id")

    where = [
        "tenant_id = %s",
        "agent_id = %s",
        "snapshot_id = %s",
    ]
    params: list[Any] = [tenant_id, agent_uuid, snapshot_uuid]

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
                """
                SELECT id
                FROM agent_software_inventory_snapshots
                WHERE id = %s
                  AND tenant_id = %s
                  AND agent_id = %s
                LIMIT 1;
                """,
                (snapshot_uuid, tenant_id, agent_uuid),
            )

            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Snapshot not found",
                )

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM agent_software_inventory_snapshot_items
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
                    snapshot_id,
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
                    item_key,
                    collected_at,
                    created_at
                FROM agent_software_inventory_snapshot_items
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
        "snapshot_id": snapshot_uuid,
    }


@router.get("/software-inventory/compare/latest")
def compare_latest_software_inventory_snapshots(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=500),
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
                    total_items,
                    sources,
                    raw_counts,
                    collection_mode,
                    collected_at,
                    created_at
                FROM agent_software_inventory_snapshots
                WHERE tenant_id = %s
                  AND agent_id = %s
                ORDER BY collected_at DESC, created_at DESC
                LIMIT 2;
                """,
                (tenant_id, agent_uuid),
            )

            snapshots = [dict(row) for row in cur.fetchall()]

            if len(snapshots) < 2:
                return {
                    "latest_snapshot": serialize_row(snapshots[0]) if snapshots else None,
                    "previous_snapshot": None,
                    "summary": {
                        "added": 0,
                        "removed": 0,
                        "changed": 0,
                    },
                    "added": [],
                    "removed": [],
                    "changed": [],
                    "message": "É necessário ter pelo menos duas coletas de software para comparar.",
                }

            latest_snapshot = snapshots[0]
            previous_snapshot = snapshots[1]

            latest_id = latest_snapshot["id"]
            previous_id = previous_snapshot["id"]

            identity_expr = """
                md5(lower(concat_ws(
                    '|',
                    COALESCE(name, ''),
                    COALESCE(publisher, ''),
                    COALESCE(source, 'unknown'),
                    COALESCE(user_sid, '')
                )))
            """

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT COUNT(*) AS total
                FROM latest l
                LEFT JOIN previous p
                    ON p.identity_key = l.identity_key
                WHERE p.id IS NULL;
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id),
            )
            added_total = int(cur.fetchone()["total"])

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT COUNT(*) AS total
                FROM previous p
                LEFT JOIN latest l
                    ON l.identity_key = p.identity_key
                WHERE l.id IS NULL;
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id),
            )
            removed_total = int(cur.fetchone()["total"])

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT COUNT(*) AS total
                FROM latest l
                INNER JOIN previous p
                    ON p.identity_key = l.identity_key
                WHERE
                    COALESCE(l.version, '') <> COALESCE(p.version, '')
                    OR COALESCE(l.install_date, '') <> COALESCE(p.install_date, '')
                    OR COALESCE(l.install_location, '') <> COALESCE(p.install_location, '');
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id),
            )
            changed_total = int(cur.fetchone()["total"])

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT
                    l.id,
                    l.name,
                    l.version,
                    l.publisher,
                    l.install_date,
                    l.source,
                    l.collected_at
                FROM latest l
                LEFT JOIN previous p
                    ON p.identity_key = l.identity_key
                WHERE p.id IS NULL
                ORDER BY l.name ASC
                LIMIT %s;
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id, limit),
            )
            added = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT
                    p.id,
                    p.name,
                    p.version,
                    p.publisher,
                    p.install_date,
                    p.source,
                    p.collected_at
                FROM previous p
                LEFT JOIN latest l
                    ON l.identity_key = p.identity_key
                WHERE l.id IS NULL
                ORDER BY p.name ASC
                LIMIT %s;
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id, limit),
            )
            removed = [serialize_row(dict(row)) for row in cur.fetchall()]

            cur.execute(
                f"""
                WITH latest AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                ),
                previous AS (
                    SELECT
                        *,
                        {identity_expr} AS identity_key
                    FROM agent_software_inventory_snapshot_items
                    WHERE tenant_id = %s
                      AND agent_id = %s
                      AND snapshot_id = %s
                )
                SELECT
                    l.name,
                    l.publisher,
                    l.source,
                    p.version AS previous_version,
                    l.version AS latest_version,
                    p.install_date AS previous_install_date,
                    l.install_date AS latest_install_date,
                    p.install_location AS previous_install_location,
                    l.install_location AS latest_install_location
                FROM latest l
                INNER JOIN previous p
                    ON p.identity_key = l.identity_key
                WHERE
                    COALESCE(l.version, '') <> COALESCE(p.version, '')
                    OR COALESCE(l.install_date, '') <> COALESCE(p.install_date, '')
                    OR COALESCE(l.install_location, '') <> COALESCE(p.install_location, '')
                ORDER BY l.name ASC
                LIMIT %s;
                """,
                (tenant_id, agent_uuid, latest_id, tenant_id, agent_uuid, previous_id, limit),
            )
            changed = [serialize_row(dict(row)) for row in cur.fetchall()]

    return {
        "latest_snapshot": serialize_row(latest_snapshot),
        "previous_snapshot": serialize_row(previous_snapshot),
        "summary": {
            "added": added_total,
            "removed": removed_total,
            "changed": changed_total,
        },
        "added": added,
        "removed": removed,
        "changed": changed,
        "limit": limit,
    }


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value != 0

    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "enabled", "on", "yes", "sim"}

    return False


def _build_security_alerts(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    defender = snapshot.get("defender") or {}
    antivirus = snapshot.get("antivirus") or []
    bitlocker = snapshot.get("bitlocker") or []
    firewall = snapshot.get("firewall") or []
    hotfixes = snapshot.get("hotfixes") or []
    local_users = snapshot.get("local_users") or []
    local_administrators = snapshot.get("local_administrators") or []

    if not _boolish(defender.get("available")):
        alerts.append({
            "severity": "critical",
            "title": "Microsoft Defender indisponível",
            "description": "Não foi possível confirmar o status do Microsoft Defender.",
            "category": "defender",
        })

    if defender and not _boolish(defender.get("antivirus_enabled", True)):
        alerts.append({
            "severity": "critical",
            "title": "Antivírus desativado",
            "description": "O Microsoft Defender aparece com antivírus desativado.",
            "category": "antivirus",
        })

    if defender and not _boolish(defender.get("real_time_protection_enabled", True)):
        alerts.append({
            "severity": "warning",
            "title": "Proteção em tempo real desativada",
            "description": "A proteção em tempo real do Microsoft Defender não está ativa.",
            "category": "defender",
        })

    if isinstance(antivirus, list) and len(antivirus) == 0:
        alerts.append({
            "severity": "critical",
            "title": "Nenhum antivírus detectado",
            "description": "Nenhum produto antivírus foi retornado pelo Security Center.",
            "category": "antivirus",
        })

    disabled_firewall_profiles = []
    if isinstance(firewall, list):
        for profile in firewall:
            enabled = profile.get("enabled") if isinstance(profile, dict) else None
            if not _boolish(enabled):
                disabled_firewall_profiles.append(profile.get("name", "perfil desconhecido"))

    if disabled_firewall_profiles:
        alerts.append({
            "severity": "warning",
            "title": "Perfil de firewall desativado",
            "description": f"Perfis afetados: {', '.join(disabled_firewall_profiles)}.",
            "category": "firewall",
            "metadata": {
                "profiles": disabled_firewall_profiles,
            },
        })

    c_drive_unprotected = False
    if isinstance(bitlocker, list):
        for volume in bitlocker:
            if not isinstance(volume, dict):
                continue

            mount_point = str(volume.get("mount_point") or "").upper()
            protection_status = str(volume.get("protection_status") or "").lower()

            if mount_point.startswith("C:") and protection_status in {"off", "false", "0", "disabled"}:
                c_drive_unprotected = True

    if c_drive_unprotected:
        alerts.append({
            "severity": "warning",
            "title": "BitLocker desprotegido no disco do sistema",
            "description": "O volume C: não aparece com proteção ativa do BitLocker.",
            "category": "bitlocker",
        })

    admin_enabled = False
    if isinstance(local_users, list):
        for user in local_users:
            if not isinstance(user, dict):
                continue

            name = str(user.get("name") or "").lower()
            enabled = _boolish(user.get("enabled"))

            if name in {"administrador", "administrator"} and enabled:
                admin_enabled = True

    if admin_enabled:
        alerts.append({
            "severity": "warning",
            "title": "Administrador local padrão habilitado",
            "description": "A conta Administrador/Administrator está habilitada.",
            "category": "local_users",
        })

    if isinstance(hotfixes, list) and len(hotfixes) == 0:
        alerts.append({
            "severity": "warning",
            "title": "Hotfixes não encontrados",
            "description": "A coleta não retornou atualizações instaladas.",
            "category": "updates",
        })

    if isinstance(local_administrators, list) and len(local_administrators) > 0:
        alerts.append({
            "severity": "info",
            "title": "Administradores locais detectados",
            "description": f"{len(local_administrators)} membro(s) encontrado(s) no grupo Administradores.",
            "category": "local_administrators",
            "metadata": {
                "count": len(local_administrators),
            },
        })

    return alerts


@router.get("/security-alerts/latest")
def get_latest_security_alerts(
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
            "alerts": [],
            "summary": {
                "critical": 0,
                "warning": 0,
                "info": 0,
                "total": 0,
            },
        }

    snapshot = serialize_row(dict(row)) or {}
    alerts = _build_security_alerts(snapshot)

    summary = {
        "critical": sum(1 for item in alerts if item["severity"] == "critical"),
        "warning": sum(1 for item in alerts if item["severity"] == "warning"),
        "info": sum(1 for item in alerts if item["severity"] == "info"),
        "total": len(alerts),
    }

    return {
        "snapshot": snapshot,
        "alerts": alerts,
        "summary": summary,
    }


@router.get("/security-snapshot/compare/latest")
def compare_latest_security_snapshots(
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
                LIMIT 2;
                """,
                (tenant_id, agent_uuid),
            )

            snapshots = [serialize_row(dict(row)) for row in cur.fetchall()]

    if len(snapshots) < 2:
        return {
            "latest_snapshot": snapshots[0] if snapshots else None,
            "previous_snapshot": None,
            "delta": {
                "security_score": 0,
                "critical_alerts": 0,
                "warning_alerts": 0,
                "info_alerts": 0,
            },
            "message": "É necessário ter pelo menos duas coletas de segurança para comparar.",
        }

    latest = snapshots[0] or {}
    previous = snapshots[1] or {}

    return {
        "latest_snapshot": latest,
        "previous_snapshot": previous,
        "delta": {
            "security_score": (latest.get("security_score") or 0) - (previous.get("security_score") or 0),
            "critical_alerts": (latest.get("critical_alerts") or 0) - (previous.get("critical_alerts") or 0),
            "warning_alerts": (latest.get("warning_alerts") or 0) - (previous.get("warning_alerts") or 0),
            "info_alerts": (latest.get("info_alerts") or 0) - (previous.get("info_alerts") or 0),
        },
    }
