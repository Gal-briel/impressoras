from datetime import datetime, timezone
import re
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import require_agent_auth
from app.infrastructure.database.models import Agent

router = APIRouter(tags=["agent-runtime"])



def _clean_text(value, max_len: int = 255):
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    return cleaned[:max_len]


def _normalize_domain_name(value):
    cleaned = str(value or "").strip().strip(".").lower()
    if not cleaned:
        return None
    return cleaned[:255]



def _prefer_domain_name(current_value, incoming_value):
    current = _normalize_domain_name(current_value)
    incoming = _normalize_domain_name(incoming_value)

    if not incoming:
        return current

    if current and "." in current and "." not in incoming:
        current_prefix = current.split(".", 1)[0]
        if current_prefix == incoming:
            return current

    return incoming


def _normalize_mac_address(value):
    raw = re.sub(r"[^0-9A-Fa-f]", "", str(value or "")).lower()
    if len(raw) != 12:
        return None
    return ":".join(raw[i:i + 2] for i in range(0, 12, 2))


@router.post("/agent/check-in")
async def agent_check_in(
    payload: dict = Body(default={}),
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

    now = datetime.now(timezone.utc)

    updates = {
        "agent_version": payload.get("agent_version"),
        "internal_ip": payload.get("internal_ip"),
        "last_ip": payload.get("internal_ip") or payload.get("last_ip"),
        "hostname": _clean_text(payload.get("hostname"), 255),
        "mac_address": _normalize_mac_address(payload.get("mac_address") or payload.get("mac")),
        "domain_name": _prefer_domain_name(getattr(agent, "domain_name", None), payload.get("domain_name") or payload.get("domain")),
        "last_seen": now,
        "last_seen_at": now,
        "last_check_in": now,
        "updated_at": now,
        "status": "online",
    }

    for field, value in updates.items():
        if hasattr(agent, field) and value is not None:
            setattr(agent, field, value)

    await session.commit()

    return {
        "status": "ok",
        "agent_id": str(agent.id),
        "pending_commands": 0,
    }
