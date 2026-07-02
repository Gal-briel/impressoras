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



def _pick_value(source: Any, *names: str, default=None):
    if not isinstance(source, dict):
        return default

    for name in names:
        value = source.get(name)
        if value not in (None, ""):
            return value

    lowered = {str(key).lower(): value for key, value in source.items()}

    for name in names:
        value = lowered.get(str(name).lower())
        if value not in (None, ""):
            return value

    return default


def _bytes_to_gb(value: Any):
    try:
        number_value = float(value)
    except (TypeError, ValueError):
        return None

    if number_value <= 0:
        return None

    return round(number_value / 1024 / 1024 / 1024, 2)


def _first_ip(value: Any):
    if isinstance(value, list):
        return value[0] if value else None

    if isinstance(value, str):
        if "," in value:
            return value.split(",", 1)[0].strip()
        return value

    return None


def _normalize_processor_rows(value: Any) -> list[dict]:
    rows = []

    for item in _normalize_list(value):
        if not isinstance(item, dict):
            continue

        rows.append({
            **item,
            "name": _pick_value(item, "name", "Name"),
            "manufacturer": _pick_value(item, "manufacturer", "Manufacturer"),
            "cores": _pick_value(item, "cores", "NumberOfCores"),
            "logical_processors": _pick_value(
                item,
                "logical_processors",
                "NumberOfLogicalProcessors",
            ),
            "max_clock_mhz": _pick_value(item, "max_clock_mhz", "MaxClockSpeed"),
            "socket_designation": _pick_value(
                item,
                "socket_designation",
                "SocketDesignation",
            ),
        })

    return rows


def _normalize_disk_rows(value: Any) -> list[dict]:
    rows = []

    for item in _normalize_list(value):
        if not isinstance(item, dict):
            continue

        size_gb = (
            _pick_value(item, "size_gb")
            or _bytes_to_gb(_pick_value(item, "Size", "size"))
        )

        rows.append({
            **item,
            "friendly_name": _pick_value(
                item,
                "friendly_name",
                "FriendlyName",
                "Model",
                "model",
            ),
            "model": _pick_value(item, "model", "Model"),
            "media_type": _pick_value(item, "media_type", "MediaType"),
            "bus_type": _pick_value(item, "bus_type", "BusType", "InterfaceType"),
            "size_gb": size_gb,
            "health_status": _pick_value(item, "health_status", "HealthStatus", "Status"),
            "serial_number": _pick_value(item, "serial_number", "SerialNumber"),
        })

    return rows


def _normalize_video_rows(value: Any) -> list[dict]:
    rows = []

    for item in _normalize_list(value):
        if not isinstance(item, dict):
            continue

        rows.append({
            **item,
            "name": _pick_value(item, "name", "Name"),
            "video_processor": _pick_value(item, "video_processor", "VideoProcessor"),
            "adapter_ram_gb": (
                _pick_value(item, "adapter_ram_gb")
                or _bytes_to_gb(_pick_value(item, "AdapterRAM"))
            ),
            "driver_version": _pick_value(item, "driver_version", "DriverVersion"),
            "status": _pick_value(item, "status", "Status"),
        })

    return rows


def _normalize_network_rows(value: Any) -> list[dict]:
    rows = []

    for item in _normalize_list(value):
        if not isinstance(item, dict):
            continue

        ip_value = _pick_value(item, "ipv4", "IPAddress", "IPAddresses")

        rows.append({
            **item,
            "name": _pick_value(item, "name", "Name", "Description"),
            "interface_description": _pick_value(
                item,
                "interface_description",
                "InterfaceDescription",
                "Description",
            ),
            "status": _pick_value(item, "status", "Status"),
            "mac_address": _pick_value(item, "mac_address", "MACAddress"),
            "ipv4": ", ".join(ip_value) if isinstance(ip_value, list) else ip_value,
            "link_speed": _pick_value(item, "link_speed", "LinkSpeed", "Speed"),
        })

    return rows


def _extract_inventory_from_diagnostics(
    diagnostics: dict,
    source_command_id: UUID | None = None,
) -> dict:
    hardware = diagnostics.get("hardware") or {}

    computer = (
        hardware.get("computer_system")
        or hardware.get("computer")
        or {}
    )
    bios = hardware.get("bios") or {}
    baseboard = hardware.get("baseboard") or {}

    processors = _normalize_processor_rows(
        hardware.get("processors")
        or hardware.get("cpu")
        or diagnostics.get("cpu")
    )

    memory_modules = _normalize_list(hardware.get("memory_modules"))

    physical_disks = _normalize_disk_rows(
        hardware.get("physical_disks")
        or hardware.get("disks")
        or diagnostics.get("disks")
    )

    volumes = _normalize_disk_rows(hardware.get("volumes"))

    network_adapters = _normalize_network_rows(
        hardware.get("network_adapters")
        or diagnostics.get("network_adapters")
    )

    video_controllers = _normalize_video_rows(
        hardware.get("video_controllers")
        or hardware.get("gpus")
    )

    os_info = diagnostics.get("os") or {}
    memory_info = diagnostics.get("memory") or {}
    network_info = diagnostics.get("network") or {}
    printers_info = diagnostics.get("printers") or {}
    cpu_info = diagnostics.get("cpu") or {}

    tpm = hardware.get("tpm") or {}
    secure_boot = hardware.get("secure_boot") or {}

    first_processor = processors[0] if processors else {}

    processor_name = (
        _pick_value(first_processor, "name", "Name")
        or _pick_value(cpu_info, "name", "Name")
        or os_info.get("processor")
    )

    cpu_cores = (
        _pick_value(first_processor, "cores", "NumberOfCores")
        or _pick_value(cpu_info, "count_physical", "cores", "NumberOfCores")
    )

    cpu_threads = (
        _pick_value(first_processor, "logical_processors", "NumberOfLogicalProcessors")
        or _pick_value(cpu_info, "count_logical", "logical_processors", "NumberOfLogicalProcessors")
    )

    primary_ip = network_info.get("internal_ip")

    if not primary_ip:
        for adapter in network_adapters:
            primary_ip = _first_ip(adapter.get("ipv4") or adapter.get("IPAddress"))
            if primary_ip:
                break

    os_name = " ".join(
        str(item)
        for item in [os_info.get("system"), os_info.get("release")]
        if item
    ) or None

    disks = physical_disks if physical_disks else volumes

    manufacturer = _pick_value(computer, "manufacturer", "Manufacturer")
    model = _pick_value(computer, "model", "Model")

    serial_number = (
        _pick_value(bios, "serial_number", "SerialNumber")
        or _pick_value(baseboard, "serial_number", "SerialNumber")
    )

    ram_total_gb = (
        _pick_value(computer, "total_physical_memory_gb")
        or _bytes_to_gb(_pick_value(computer, "TotalPhysicalMemory"))
        or memory_info.get("total_gb")
    )

    normalized_hardware = {
        **hardware,
        "computer_system": {
            **computer,
            "manufacturer": manufacturer,
            "model": model,
            "name": _pick_value(computer, "name", "Name"),
            "domain": _pick_value(computer, "domain", "Domain"),
            "total_physical_memory_gb": ram_total_gb,
            "system_type": _pick_value(computer, "system_type", "SystemType"),
        },
        "bios": {
            **bios,
            "manufacturer": _pick_value(bios, "manufacturer", "Manufacturer"),
            "version": _pick_value(bios, "version", "Version", "SMBIOSBIOSVersion"),
            "serial_number": _pick_value(bios, "serial_number", "SerialNumber"),
            "release_date": _pick_value(bios, "release_date", "ReleaseDate"),
        },
        "baseboard": {
            **baseboard,
            "manufacturer": _pick_value(baseboard, "manufacturer", "Manufacturer"),
            "product": _pick_value(baseboard, "product", "Product"),
            "version": _pick_value(baseboard, "version", "Version"),
            "serial_number": _pick_value(baseboard, "serial_number", "SerialNumber"),
        },
        "processors": processors,
        "physical_disks": physical_disks,
        "video_controllers": video_controllers,
        "network_adapters": network_adapters,
    }

    return {
        "source_command_id": str(source_command_id) if source_command_id else None,

        "hostname": diagnostics.get("hostname") or _pick_value(computer, "name", "Name"),
        "domain_name": diagnostics.get("domain") or _pick_value(computer, "domain", "Domain"),
        "logged_user": diagnostics.get("user") or _pick_value(computer, "username", "UserName"),

        "manufacturer": manufacturer,
        "model": model,
        "serial_number": serial_number,

        "os_name": os_name,
        "os_version": os_info.get("version"),
        "os_build": os_info.get("version"),
        "architecture": os_info.get("machine") or _pick_value(computer, "system_type", "SystemType"),

        "processor_name": processor_name,
        "cpu_cores": cpu_cores,
        "cpu_threads": cpu_threads,

        "ram_total_gb": ram_total_gb,
        "primary_ip": primary_ip,

        "tpm_present": _pick_value(tpm, "present", "Present"),
        "tpm_ready": _pick_value(tpm, "ready", "Ready"),
        "secure_boot_enabled": _pick_value(secure_boot, "enabled", "Enabled"),

        "disks": disks,
        "memory_modules": memory_modules,
        "network_adapters": network_adapters,
        "video_controllers": video_controllers,
        "printers": printers_info.get("items") or [],

        "hardware": normalized_hardware,
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
