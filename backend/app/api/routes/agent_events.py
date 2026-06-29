from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user, require_agent_auth
from app.infrastructure.database.models import Agent

try:
    from app.infrastructure.database.models import AgentEvent
except ImportError:
    AgentEvent = None


router = APIRouter(tags=["agent-events"])


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


def _has_attr(obj: Any, attr: str) -> bool:
    return hasattr(obj, attr)


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


def _event_to_dict(event) -> dict:
    event_type = _get_attr(
        event,
        ["event_type", "type", "name", "action"],
        "event",
    )

    severity = _get_attr(
        event,
        ["severity", "level"],
        "info",
    )

    message = _get_attr(
        event,
        ["message", "description"],
        str(event_type),
    )

    payload = _get_attr(
        event,
        ["payload", "details", "data", "raw_data"],
        {},
    )

    return {
        "id": _jsonable(_get_attr(event, ["id"])),
        "tenant_id": _jsonable(_get_attr(event, ["tenant_id"])),
        "agent_id": _jsonable(_get_attr(event, ["agent_id"])),
        "event_type": _jsonable(event_type),
        "type": _jsonable(event_type),
        "severity": _jsonable(severity),
        "level": _jsonable(severity),
        "message": _jsonable(message),
        "payload": _jsonable(payload or {}),
        "details": _jsonable(payload or {}),
        "created_at": _jsonable(_get_attr(event, ["created_at"])),
        "updated_at": _jsonable(_get_attr(event, ["updated_at"])),
    }


async def _get_agent_or_404(
    session: AsyncSession,
    tenant_id: UUID | None,
    agent_id: UUID,
) -> Agent:
    stmt = select(Agent).where(Agent.id == agent_id)

    if tenant_id is not None and hasattr(Agent, "tenant_id"):
        stmt = stmt.where(Agent.tenant_id == tenant_id)

    result = await session.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return agent


@router.get("/agents/{agent_id}/events")
async def list_agent_events(
    agent_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    if AgentEvent is None:
        return {
            "items": [],
            "total": 0,
            "warning": "AgentEvent model not found",
        }

    tenant_id = UUID(current_user.tenant_id)

    await _get_agent_or_404(session, tenant_id, agent_id)

    try:
        stmt = select(AgentEvent)

        if _has_attr(AgentEvent, "agent_id"):
            stmt = stmt.where(AgentEvent.agent_id == agent_id)

        if _has_attr(AgentEvent, "tenant_id"):
            stmt = stmt.where(AgentEvent.tenant_id == tenant_id)

        if _has_attr(AgentEvent, "created_at"):
            stmt = stmt.order_by(AgentEvent.created_at.desc())

        stmt = stmt.limit(limit)

        result = await session.execute(stmt)
        events = result.scalars().all()

        return {
            "items": [_event_to_dict(event) for event in events],
            "total": len(events),
        }

    except Exception as exc:
        return {
            "items": [],
            "total": 0,
            "warning": str(exc),
        }


@router.post("/agent/events")
async def create_authenticated_agent_event(
    body: dict = Body(...),
    authenticated_agent_id: str = Depends(require_agent_auth),
    session: AsyncSession = Depends(get_db_session),
):
    if AgentEvent is None:
        return {
            "stored": False,
            "warning": "AgentEvent model not found",
        }

    agent_id = UUID(authenticated_agent_id)

    result = await session.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    tenant_id = getattr(agent, "tenant_id", None)

    event_type = body.get("event_type") or body.get("type") or "agent_event"
    severity = body.get("severity") or body.get("level") or "info"
    message = body.get("message") or body.get("description") or str(event_type)
    payload = body.get("payload") or body.get("details") or {}

    try:
        event = AgentEvent()

        _set_if_exists(event, "id", uuid4())
        _set_if_exists(event, "tenant_id", tenant_id)
        _set_if_exists(event, "agent_id", agent_id)
        _set_if_exists(event, "event_type", event_type)
        _set_if_exists(event, "type", event_type)
        _set_if_exists(event, "name", event_type)
        _set_if_exists(event, "severity", severity)
        _set_if_exists(event, "level", severity)
        _set_if_exists(event, "message", message)
        _set_if_exists(event, "description", message)
        _set_if_exists(event, "payload", payload)
        _set_if_exists(event, "details", payload)
        _set_if_exists(event, "data", payload)
        _set_if_exists(event, "created_at", datetime.now(timezone.utc))
        _set_if_exists(event, "updated_at", datetime.now(timezone.utc))

        session.add(event)
        await session.commit()

        return {
            "stored": True,
            "event": _event_to_dict(event),
        }

    except SQLAlchemyError as exc:
        await session.rollback()

        return {
            "stored": False,
            "warning": str(exc),
        }
