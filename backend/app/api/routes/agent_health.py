from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user
from app.infrastructure.database.models import Agent, Command

try:
    from app.infrastructure.database.models import AgentEvent
except Exception:
    AgentEvent = None


router = APIRouter(tags=["agent-health"])


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
        return {str(k): _jsonable(v) for k, v in value.items()}

    if isinstance(value, list):
        return [_jsonable(v) for v in value]

    if isinstance(value, (str, int, float, bool)):
        return value

    return str(value)


def _get_attr(obj: Any, names: list[str], default=None):
    for name in names:
        if hasattr(obj, name):
            value = getattr(obj, name)
            if value is not None:
                return value

    return default


def _aware(dt: datetime | None):
    if not dt:
        return None

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(timezone.utc)


def _seconds_since(dt: datetime | None):
    aware_dt = _aware(dt)

    if not aware_dt:
        return None

    return int((datetime.now(timezone.utc) - aware_dt).total_seconds())


def _command_to_summary(command: Command):
    return {
        "id": _jsonable(_get_attr(command, ["id"])),
        "command_type": _jsonable(_get_attr(command, ["command_type", "type"])),
        "status": _jsonable(_get_attr(command, ["status"])),
        "error_code": _jsonable(_get_attr(command, ["error_code"])),
        "created_at": _jsonable(_get_attr(command, ["created_at"])),
        "updated_at": _jsonable(_get_attr(command, ["updated_at"])),
        "completed_at": _jsonable(_get_attr(command, ["completed_at", "finished_at"])),
    }


def _event_to_summary(event):
    event_type = _get_attr(event, ["event_type", "type", "name"], "event")
    severity = _get_attr(event, ["severity", "level"], "info")
    message = _get_attr(event, ["message", "description"], str(event_type))

    return {
        "id": _jsonable(_get_attr(event, ["id"])),
        "event_type": _jsonable(event_type),
        "severity": _jsonable(severity),
        "message": _jsonable(message),
        "created_at": _jsonable(_get_attr(event, ["created_at"])),
    }


@router.get("/agents/{agent_id}/health")
async def get_agent_health(
    agent_id: UUID,
    recent_limit: int = Query(default=10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(current_user.tenant_id)

    agent_stmt = select(Agent).where(Agent.id == agent_id)

    if hasattr(Agent, "tenant_id"):
        agent_stmt = agent_stmt.where(Agent.tenant_id == tenant_id)

    agent_result = await session.execute(agent_stmt)
    agent = agent_result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    last_seen_at = _get_attr(
        agent,
        ["last_seen_at", "last_check_in", "last_checkin_at", "updated_at"],
    )

    seconds_since_last_seen = _seconds_since(last_seen_at)

    is_online = (
        seconds_since_last_seen is not None
        and seconds_since_last_seen <= 120
    )

    command_stmt = select(Command).where(Command.agent_id == agent_id)

    if hasattr(Command, "tenant_id"):
        command_stmt = command_stmt.where(Command.tenant_id == tenant_id)

    if hasattr(Command, "created_at"):
        command_stmt = command_stmt.order_by(Command.created_at.desc())

    command_stmt = command_stmt.limit(recent_limit)

    command_result = await session.execute(command_stmt)
    recent_commands = command_result.scalars().all()

    recent_events = []

    if AgentEvent is not None:
        try:
            event_stmt = select(AgentEvent)

            if hasattr(AgentEvent, "agent_id"):
                event_stmt = event_stmt.where(AgentEvent.agent_id == agent_id)

            if hasattr(AgentEvent, "tenant_id"):
                event_stmt = event_stmt.where(AgentEvent.tenant_id == tenant_id)

            if hasattr(AgentEvent, "created_at"):
                event_stmt = event_stmt.order_by(AgentEvent.created_at.desc())

            event_stmt = event_stmt.limit(recent_limit)

            event_result = await session.execute(event_stmt)
            recent_events = event_result.scalars().all()
        except Exception:
            recent_events = []

    return {
        "agent": {
            "id": str(agent.id),
            "name": _jsonable(_get_attr(agent, ["name", "hostname", "display_name"])),
            "hostname": _jsonable(_get_attr(agent, ["hostname", "name"])),
            "status": "online" if is_online else "offline",
            "raw_status": _jsonable(_get_attr(agent, ["status"])),
            "agent_version": _jsonable(_get_attr(agent, ["agent_version", "version"])),
            "internal_ip": _jsonable(_get_attr(agent, ["internal_ip", "last_ip"])),
            "external_ip": _jsonable(_get_attr(agent, ["external_ip"])),
            "last_seen_at": _jsonable(last_seen_at),
            "seconds_since_last_seen": seconds_since_last_seen,
        },
        "health": {
            "is_online": is_online,
            "heartbeat_threshold_seconds": 120,
            "seconds_since_last_seen": seconds_since_last_seen,
            "needs_attention": not is_online,
        },
        "recent_commands": [_command_to_summary(command) for command in recent_commands],
        "recent_events": [_event_to_summary(event) for event in recent_events],
    }
