from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user, require_agent_auth
from app.infrastructure.database.models import Agent, Printer
from app.core.dependencies import require_agent_auth

router = APIRouter(tags=["printers"])


def _as_uuid(value) -> UUID:
    if isinstance(value, UUID):
        return value

    return UUID(str(value))


def _safe_value(value: Any):
    if hasattr(value, "value"):
        return value.value

    return value


def _has_attr(model_or_obj: Any, attr: str) -> bool:
    return hasattr(model_or_obj, attr)


def _get_attr(obj: Any, names: list[str], default=None):
    for name in names:
        if hasattr(obj, name):
            value = getattr(obj, name)

            if value is not None:
                return value

    return default


def _set_if_exists(obj: Any, attr: str, value: Any) -> None:
    if hasattr(obj, attr):
        setattr(obj, attr, value)


def _get_payload_value(payload: dict, names: list[str], default=None):
    for name in names:
        value = payload.get(name)

        if value is not None and value != "":
            return value

    return default


def _infer_is_network(port: str | None) -> bool:
    if not port:
        return False

    normalized = str(port).lower()

    return (
        normalized.startswith("ip_")
        or normalized.startswith("\\\\")
        or "tcp" in normalized
        or "192." in normalized
        or "10." in normalized
        or "172." in normalized
    )


def _infer_is_online(status_value: str | None):
    if not status_value:
        return None

    normalized = str(status_value).lower()

    if normalized in ["online", "ready", "ok", "idle"]:
        return True

    if normalized in ["offline", "error", "failed", "disabled"]:
        return False

    return None


def _printer_to_dict(printer: Printer, agent_hostname: str | None = None) -> dict:
    name = _get_attr(printer, ["name", "printer_name"], "Impressora sem nome")
    driver = _get_attr(printer, ["driver_name", "driver"], None)
    port = _get_attr(printer, ["port_name", "port"], None)
    status_value = _safe_value(_get_attr(printer, ["status"], "unknown"))

    is_shared = bool(_get_attr(printer, ["is_shared"], False))
    is_network = bool(_get_attr(printer, ["is_network"], _infer_is_network(port)))
    is_online = _get_attr(printer, ["is_online"], _infer_is_online(status_value))
    updated_at = _get_attr(printer, ["last_seen_at", "updated_at"], None)

    return {
        "id": str(printer.id),
        "tenant_id": str(printer.tenant_id),
        "agent_id": str(printer.agent_id),
        "agent_hostname": agent_hostname,
        "name": name,
        "printer_name": name,
        "driver_name": driver,
        "port_name": port,
        "share_name": _get_attr(printer, ["share_name"], None),
        "location": _get_attr(printer, ["location"], None),
        "comment": _get_attr(printer, ["comment"], None),
        "status": status_value,
        "is_default": bool(_get_attr(printer, ["is_default"], False)),
        "is_shared": is_shared,
        "is_network": is_network,
        "is_online": is_online,
        "last_seen_at": updated_at,
        "created_at": _get_attr(printer, ["created_at"], None),
        "updated_at": _get_attr(printer, ["updated_at"], None),
    }


async def _get_agent_or_404(
    session: AsyncSession,
    tenant_id: UUID,
    agent_id: UUID,
) -> Agent:
    result = await session.execute(
        select(Agent).where(
            Agent.id == agent_id,
            Agent.tenant_id == tenant_id,
        )
    )

    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return agent


@router.get("/printers")
async def list_printers(
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = _as_uuid(current_user.tenant_id)

    stmt = (
        select(Printer, Agent.hostname)
        .join(Agent, Printer.agent_id == Agent.id)
        .where(Printer.tenant_id == tenant_id)
    )

    if _has_attr(Printer, "deleted_at"):
        stmt = stmt.where(Printer.deleted_at.is_(None))

    if _has_attr(Printer, "updated_at"):
        stmt = stmt.order_by(Printer.updated_at.desc())
    elif _has_attr(Printer, "created_at"):
        stmt = stmt.order_by(Printer.created_at.desc())

    stmt = stmt.limit(limit)

    result = await session.execute(stmt)
    rows = result.all()

    items = [
        _printer_to_dict(printer, agent_hostname)
        for printer, agent_hostname in rows
    ]

    return {
        "items": items,
        "total": len(items),
    }


@router.get("/printers/{printer_id}")
async def get_printer(
    printer_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = _as_uuid(current_user.tenant_id)

    result = await session.execute(
        select(Printer, Agent.hostname)
        .join(Agent, Printer.agent_id == Agent.id)
        .where(
            Printer.id == printer_id,
            Printer.tenant_id == tenant_id,
        )
    )

    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Printer not found",
        )

    printer, agent_hostname = row

    return _printer_to_dict(printer, agent_hostname)


@router.get("/agents/{agent_id}/printers")
async def list_agent_printers(
    agent_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = _as_uuid(current_user.tenant_id)

    await _get_agent_or_404(session, tenant_id, agent_id)

    stmt = (
        select(Printer, Agent.hostname)
        .join(Agent, Printer.agent_id == Agent.id)
        .where(
            Printer.tenant_id == tenant_id,
            Printer.agent_id == agent_id,
        )
    )

    if _has_attr(Printer, "deleted_at"):
        stmt = stmt.where(Printer.deleted_at.is_(None))

    if _has_attr(Printer, "updated_at"):
        stmt = stmt.order_by(Printer.updated_at.desc())
    elif _has_attr(Printer, "created_at"):
        stmt = stmt.order_by(Printer.created_at.desc())

    stmt = stmt.limit(limit)

    result = await session.execute(stmt)
    rows = result.all()

    items = [
        _printer_to_dict(printer, agent_hostname)
        for printer, agent_hostname in rows
    ]

    return {
        "items": items,
        "total": len(items),
    }


@router.post("/agents/{agent_id}/printers/inventory")
async def upsert_agent_printer_inventory(
    agent_id: UUID,
    body: dict = Body(...),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = _as_uuid(current_user.tenant_id)

    await _get_agent_or_404(session, tenant_id, agent_id)

    printers_payload = body.get("printers", [])

    if not isinstance(printers_payload, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field 'printers' must be a list",
        )

    now = datetime.now(timezone.utc)

    created_count = 0
    updated_count = 0
    ignored_count = 0

    for item in printers_payload:
        if not isinstance(item, dict):
            ignored_count += 1
            continue

        name = _get_payload_value(
            item,
            ["name", "printer_name", "display_name", "queue_name"],
        )

        if not name:
            ignored_count += 1
            continue

        driver = _get_payload_value(
            item,
            ["driver_name", "driver", "model"],
            "Driver desconhecido",
        )

        port = _get_payload_value(
            item,
            ["port_name", "port", "printer_port"],
            "Porta desconhecida",
        )

        status_text = str(
            _get_payload_value(
                item,
                ["status", "state"],
                "unknown",
            )
        )

        result = await session.execute(
            select(Printer).where(
                Printer.tenant_id == tenant_id,
                Printer.agent_id == agent_id,
                Printer.name == name,
            )
        )

        printer = result.scalar_one_or_none()

        if printer:
            updated_count += 1
        else:
            create_kwargs = {
                "tenant_id": tenant_id,
                "agent_id": agent_id,
                "name": name,
            }

            if _has_attr(Printer, "driver"):
                create_kwargs["driver"] = driver

            if _has_attr(Printer, "driver_name"):
                create_kwargs["driver_name"] = driver

            if _has_attr(Printer, "port"):
                create_kwargs["port"] = port

            if _has_attr(Printer, "port_name"):
                create_kwargs["port_name"] = port

            if _has_attr(Printer, "status"):
                create_kwargs["status"] = status_text

            printer = Printer(**create_kwargs)
            session.add(printer)
            created_count += 1

        _set_if_exists(printer, "name", name)
        _set_if_exists(printer, "driver", driver)
        _set_if_exists(printer, "driver_name", driver)
        _set_if_exists(printer, "port", port)
        _set_if_exists(printer, "port_name", port)
        _set_if_exists(printer, "share_name", _get_payload_value(item, ["share_name", "shared_name"]))
        _set_if_exists(printer, "location", _get_payload_value(item, ["location"]))
        _set_if_exists(printer, "comment", _get_payload_value(item, ["comment", "description"]))
        _set_if_exists(printer, "status", status_text)
        _set_if_exists(printer, "is_default", bool(_get_payload_value(item, ["is_default", "default"], False)))
        _set_if_exists(printer, "is_shared", bool(_get_payload_value(item, ["is_shared", "shared"], False)))
        _set_if_exists(printer, "is_network", bool(_get_payload_value(item, ["is_network", "network"], _infer_is_network(port))))

        online_value = _get_payload_value(item, ["is_online", "online"], None)
        _set_if_exists(
            printer,
            "is_online",
            online_value if isinstance(online_value, bool) else _infer_is_online(status_text),
        )

        _set_if_exists(printer, "raw_data", item)
        _set_if_exists(printer, "last_seen_at", now)
        _set_if_exists(printer, "updated_at", now)

    await session.commit()

    return {
        "created": created_count,
        "updated": updated_count,
        "ignored": ignored_count,
        "total_received": len(printers_payload),
    }


@router.post("/agent/printers/inventory")
async def upsert_authenticated_agent_printer_inventory(
    body: dict = Body(...),
    authenticated_agent_id: str = Depends(require_agent_auth),
    session: AsyncSession = Depends(get_db_session),
):
    agent_id = UUID(authenticated_agent_id)

    result = await session.execute(
        select(Agent).where(Agent.id == agent_id)
    )

    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    tenant_id = agent.tenant_id
    printers_payload = body.get("printers", [])

    if not isinstance(printers_payload, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field 'printers' must be a list",
        )

    now = datetime.now(timezone.utc)

    created_count = 0
    updated_count = 0
    ignored_count = 0

    for item in printers_payload:
        if not isinstance(item, dict):
            ignored_count += 1
            continue

        name = _get_payload_value(
            item,
            ["name", "printer_name", "display_name", "queue_name"],
        )

        if not name:
            ignored_count += 1
            continue

        driver = _get_payload_value(
            item,
            ["driver_name", "driver", "model"],
            "Driver desconhecido",
        )

        port = _get_payload_value(
            item,
            ["port_name", "port", "printer_port"],
            "Porta desconhecida",
        )

        status_text = str(
            _get_payload_value(
                item,
                ["status", "state"],
                "unknown",
            )
        )

        result = await session.execute(
            select(Printer).where(
                Printer.tenant_id == tenant_id,
                Printer.agent_id == agent_id,
                Printer.name == name,
            )
        )

        printer = result.scalar_one_or_none()

        if printer:
            updated_count += 1
        else:
            create_kwargs = {
                "tenant_id": tenant_id,
                "agent_id": agent_id,
                "name": name,
            }

            if _has_attr(Printer, "driver"):
                create_kwargs["driver"] = driver

            if _has_attr(Printer, "driver_name"):
                create_kwargs["driver_name"] = driver

            if _has_attr(Printer, "port"):
                create_kwargs["port"] = port

            if _has_attr(Printer, "port_name"):
                create_kwargs["port_name"] = port

            if _has_attr(Printer, "status"):
                create_kwargs["status"] = status_text

            printer = Printer(**create_kwargs)
            session.add(printer)
            created_count += 1

        _set_if_exists(printer, "name", name)
        _set_if_exists(printer, "driver", driver)
        _set_if_exists(printer, "driver_name", driver)
        _set_if_exists(printer, "port", port)
        _set_if_exists(printer, "port_name", port)
        _set_if_exists(printer, "share_name", _get_payload_value(item, ["share_name", "shared_name"]))
        _set_if_exists(printer, "location", _get_payload_value(item, ["location"]))
        _set_if_exists(printer, "comment", _get_payload_value(item, ["comment", "description"]))
        _set_if_exists(printer, "status", status_text)
        _set_if_exists(printer, "is_default", bool(_get_payload_value(item, ["is_default", "default"], False)))
        _set_if_exists(printer, "is_shared", bool(_get_payload_value(item, ["is_shared", "shared"], False)))
        _set_if_exists(printer, "is_network", bool(_get_payload_value(item, ["is_network", "network"], _infer_is_network(port))))

        online_value = _get_payload_value(item, ["is_online", "online"], None)
        _set_if_exists(
            printer,
            "is_online",
            online_value if isinstance(online_value, bool) else _infer_is_online(status_text),
        )

        _set_if_exists(printer, "raw_data", item)
        _set_if_exists(printer, "last_seen_at", now)
        _set_if_exists(printer, "updated_at", now)

    await session.commit()

    return {
        "created": created_count,
        "updated": updated_count,
        "ignored": ignored_count,
        "total_received": len(printers_payload),
    }

