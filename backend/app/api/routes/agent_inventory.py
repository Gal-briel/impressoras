import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user
from app.infrastructure.database.models import Agent, Command


router = APIRouter(tags=["agent-inventory"])


def _jsonable(value: Any):
    if value is None:
        return None

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, datetime):
        return value.isoformat()

    if hasattr(value, "value"):
        return value.value

    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_jsonable(item) for item in value]

    if isinstance(value, (str, int, float, bool)):
        return value

    return str(value)


def _safe_value(value: Any):
    if hasattr(value, "value"):
        return value.value

    return value


def _get_attr(obj: Any, names: list[str], default=None):
    for name in names:
        if hasattr(obj, name):
            value = getattr(obj, name)

            if value is not None:
                return value

    return default


def _normalize_list(value: Any) -> list:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        return [value]

    return []


def _parse_json_payload(raw: Any) -> dict:
    if raw is None:
        return {}

    if isinstance(raw, dict):
        return raw

    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    return {}


async def _ensure_inventory_table(session: AsyncSession) -> None:
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS agent_inventory_snapshots (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                agent_id TEXT NOT NULL UNIQUE,
                source_command_id TEXT NULL,
                inventory TEXT NOT NULL,
                collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )

    await session.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_agent_inventory_snapshots_tenant_id
            ON agent_inventory_snapshots(tenant_id)
            """
        )
    )

    await session.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_agent_inventory_snapshots_agent_id
            ON agent_inventory_snapshots(agent_id)
            """
        )
    )

    await session.commit()


async def _get_agent_or_404(
    session: AsyncSession,
    tenant_id: UUID,
    agent_id: UUID,
) -> Agent:
    stmt = select(Agent).where(Agent.id == agent_id)

    if hasattr(Agent, "tenant_id"):
        stmt = stmt.where(Agent.tenant_id == tenant_id)

    result = await session.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return agent


async def _get_latest_diagnostics_command(
    session: AsyncSession,
    tenant_id: UUID,
    agent_id: UUID,
) -> Command | None:
    stmt = select(Command).where(Command.agent_id == agent_id)

    if hasattr(Command, "tenant_id"):
        stmt = stmt.where(Command.tenant_id == tenant_id)

    if hasattr(Command, "created_at"):
        stmt = stmt.order_by(Command.created_at.desc())

    stmt = stmt.limit(100)

    result = await session.execute(stmt)
    commands = result.scalars().all()

    for command in commands:
        command_type = str(
            _safe_value(_get_attr(command, ["command_type", "type"], ""))
        )

        command_status = str(
            _safe_value(_get_attr(command, ["status"], ""))
        ).lower()

        if command_type == "collect_diagnostics" and command_status == "success":
            return command

    return None


def _extract_inventory_from_diagnostics(
    diagnostics: dict,
    source_command_id: UUID | None = None,
) -> dict:
    hardware = diagnostics.get("hardware") or {}

    computer = hardware.get("computer_system") or {}
    bios = hardware.get("bios") or {}
    processors = _normalize_list(hardware.get("processors"))
    memory_modules = _normalize_list(hardware.get("memory_modules"))
    physical_disks = _normalize_list(hardware.get("physical_disks"))
    volumes = _normalize_list(hardware.get("volumes"))
    network_adapters = _normalize_list(hardware.get("network_adapters"))
    video_controllers = _normalize_list(hardware.get("video_controllers"))

    os_info = diagnostics.get("os") or {}
    memory_info = diagnostics.get("memory") or {}
    network_info = diagnostics.get("network") or {}
    printers_info = diagnostics.get("printers") or {}
    cpu_info = diagnostics.get("cpu") or {}

    tpm = hardware.get("tpm") or {}
    secure_boot = hardware.get("secure_boot") or {}

    first_processor = processors[0] if processors else {}

    processor_name = first_processor.get("name") or os_info.get("processor")
    cpu_cores = first_processor.get("cores") or cpu_info.get("count_physical")
    cpu_threads = first_processor.get("logical_processors") or cpu_info.get("count_logical")

    primary_ip = network_info.get("internal_ip")

    if not primary_ip:
        for adapter in network_adapters:
            ips = adapter.get("ipv4")

            if isinstance(ips, list) and ips:
                primary_ip = ips[0]
                break

    os_name = " ".join(
        str(item)
        for item in [os_info.get("system"), os_info.get("release")]
        if item
    ) or None

    disks = physical_disks if physical_disks else volumes

    return {
        "source_command_id": str(source_command_id) if source_command_id else None,

        "hostname": diagnostics.get("hostname") or computer.get("name"),
        "domain_name": diagnostics.get("domain") or computer.get("domain"),
        "logged_user": diagnostics.get("user") or computer.get("username"),

        "manufacturer": computer.get("manufacturer"),
        "model": computer.get("model"),
        "serial_number": bios.get("serial_number"),

        "os_name": os_name,
        "os_version": os_info.get("version"),
        "os_build": os_info.get("version"),
        "architecture": os_info.get("machine") or computer.get("system_type"),

        "processor_name": processor_name,
        "cpu_cores": cpu_cores,
        "cpu_threads": cpu_threads,

        "ram_total_gb": computer.get("total_physical_memory_gb") or memory_info.get("total_gb"),
        "primary_ip": primary_ip,

        "tpm_present": tpm.get("present"),
        "tpm_ready": tpm.get("ready"),
        "secure_boot_enabled": secure_boot.get("enabled"),

        "disks": disks,
        "memory_modules": memory_modules,
        "network_adapters": network_adapters,
        "video_controllers": video_controllers,
        "printers": printers_info.get("items") or [],

        "hardware": hardware,
        "raw_diagnostics": diagnostics,
    }


def _merge_inventory_row(row: dict | None) -> dict | None:
    if not row:
        return None

    inventory = _parse_json_payload(row.get("inventory"))

    inventory["id"] = row.get("id")
    inventory["tenant_id"] = row.get("tenant_id")
    inventory["agent_id"] = row.get("agent_id")
    inventory["source_command_id"] = row.get("source_command_id")
    inventory["collected_at"] = _jsonable(row.get("collected_at"))
    inventory["created_at"] = _jsonable(row.get("created_at"))
    inventory["updated_at"] = _jsonable(row.get("updated_at"))

    return _jsonable(inventory)


async def _get_inventory_row(
    session: AsyncSession,
    tenant_id: UUID,
    agent_id: UUID,
) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT
                id,
                tenant_id,
                agent_id,
                source_command_id,
                inventory,
                collected_at,
                created_at,
                updated_at
            FROM agent_inventory_snapshots
            WHERE tenant_id = :tenant_id
              AND agent_id = :agent_id
            LIMIT 1
            """
        ),
        {
            "tenant_id": str(tenant_id),
            "agent_id": str(agent_id),
        },
    )

    row = result.mappings().first()

    return _merge_inventory_row(dict(row)) if row else None


async def _upsert_inventory(
    session: AsyncSession,
    tenant_id: UUID,
    agent_id: UUID,
    inventory: dict,
) -> dict:
    await session.execute(
        text(
            """
            INSERT INTO agent_inventory_snapshots (
                id,
                tenant_id,
                agent_id,
                source_command_id,
                inventory,
                collected_at,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :tenant_id,
                :agent_id,
                :source_command_id,
                :inventory,
                NOW(),
                NOW(),
                NOW()
            )
            ON CONFLICT (agent_id)
            DO UPDATE SET
                source_command_id = EXCLUDED.source_command_id,
                inventory = EXCLUDED.inventory,
                collected_at = NOW(),
                updated_at = NOW()
            """
        ),
        {
            "id": str(uuid4()),
            "tenant_id": str(tenant_id),
            "agent_id": str(agent_id),
            "source_command_id": inventory.get("source_command_id"),
            "inventory": json.dumps(inventory, ensure_ascii=False),
        },
    )

    await session.commit()

    inventory_row = await _get_inventory_row(
        session=session,
        tenant_id=tenant_id,
        agent_id=agent_id,
    )

    return inventory_row or {}


@router.get("/agents/{agent_id}/inventory")
async def get_agent_inventory(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(str(current_user.tenant_id))

    await _ensure_inventory_table(session)
    await _get_agent_or_404(session, tenant_id, agent_id)

    inventory = await _get_inventory_row(session, tenant_id, agent_id)

    return {
        "inventory": inventory,
    }


@router.post("/agents/{agent_id}/inventory/from-latest-diagnostics")
async def create_inventory_from_latest_diagnostics(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(str(current_user.tenant_id))

    await _ensure_inventory_table(session)
    await _get_agent_or_404(session, tenant_id, agent_id)

    command = await _get_latest_diagnostics_command(session, tenant_id, agent_id)

    if not command:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No successful collect_diagnostics command found for this agent",
        )

    raw_output = _get_attr(command, ["output", "result"])
    diagnostics = _parse_json_payload(raw_output)

    if not diagnostics:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Latest diagnostics command has invalid or empty output",
        )

    inventory_payload = _extract_inventory_from_diagnostics(
        diagnostics=diagnostics,
        source_command_id=_get_attr(command, ["id"]),
    )

    inventory = await _upsert_inventory(
        session=session,
        tenant_id=tenant_id,
        agent_id=agent_id,
        inventory=inventory_payload,
    )

    return {
        "inventory": inventory,
        "source_command_id": str(_get_attr(command, ["id"])),
    }


@router.get("/inventory/devices")
async def list_inventory_devices(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(str(current_user.tenant_id))

    await _ensure_inventory_table(session)

    result = await session.execute(
        text(
            """
            SELECT
                id,
                tenant_id,
                agent_id,
                source_command_id,
                inventory,
                collected_at,
                created_at,
                updated_at
            FROM agent_inventory_snapshots
            WHERE tenant_id = :tenant_id
            ORDER BY updated_at DESC
            """
        ),
        {
            "tenant_id": str(tenant_id),
        },
    )

    rows = result.mappings().all()

    items = []

    for row in rows:
        inventory = _merge_inventory_row(dict(row))

        if inventory:
            items.append({
                "id": inventory.get("id"),
                "tenant_id": inventory.get("tenant_id"),
                "agent_id": inventory.get("agent_id"),
                "hostname": inventory.get("hostname"),
                "manufacturer": inventory.get("manufacturer"),
                "model": inventory.get("model"),
                "serial_number": inventory.get("serial_number"),
                "os_name": inventory.get("os_name"),
                "os_version": inventory.get("os_version"),
                "processor_name": inventory.get("processor_name"),
                "ram_total_gb": inventory.get("ram_total_gb"),
                "primary_ip": inventory.get("primary_ip"),
                "tpm_present": inventory.get("tpm_present"),
                "tpm_ready": inventory.get("tpm_ready"),
                "secure_boot_enabled": inventory.get("secure_boot_enabled"),
                "collected_at": inventory.get("collected_at"),
                "updated_at": inventory.get("updated_at"),
            })

    return {
        "items": items,
        "total": len(items),
    }
