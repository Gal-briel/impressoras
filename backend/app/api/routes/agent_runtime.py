from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import require_agent_auth
from app.infrastructure.database.models import Agent

router = APIRouter(tags=["agent-runtime"])


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
