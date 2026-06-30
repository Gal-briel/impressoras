from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.infrastructure.database.models import Agent, Command

router = APIRouter(tags=["dashboard"])


def _value(value) -> str:
    if value is None:
        return ""
    return str(getattr(value, "value", value)).lower()


def _get_datetime(obj, *names):
    for name in names:
        value = getattr(obj, name, None)
        if value:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value
    return None


@router.get("/dashboard/summary")
async def dashboard_summary(
    session: AsyncSession = Depends(get_db_session),
):
    now = datetime.now(timezone.utc)
    online_cutoff = now - timedelta(minutes=2)

    agents_result = await session.execute(select(Agent))
    agents = list(agents_result.scalars().all())

    commands_result = await session.execute(select(Command))
    commands = list(commands_result.scalars().all())

    online_agents = 0
    offline_or_revoked_agents = 0

    for agent in agents:
        status = _value(
            getattr(agent, "calculated_status", None)
            or getattr(agent, "status", None)
            or getattr(agent, "enrollment_status", None)
        )

        revoked_at = getattr(agent, "revoked_at", None)
        last_seen = _get_datetime(
            agent,
            "last_seen",
            "last_seen_at",
            "last_checkin_at",
            "last_heartbeat_at",
        )

        is_revoked = revoked_at is not None or "revoked" in status
        is_recent = bool(last_seen and last_seen >= online_cutoff)
        is_online = not is_revoked and ("online" in status or is_recent)

        if is_online:
            online_agents += 1
        else:
            offline_or_revoked_agents += 1

    pending_statuses = {
        "queued",
        "pending",
        "dispatched",
        "acknowledged",
        "executing",
        "running",
        "in_progress",
    }

    failed_statuses = {
        "failed",
        "timed_out",
        "timeout",
        "expired",
        "error",
    }

    pending_commands = 0
    success_commands = 0
    failed_commands = 0

    for command in commands:
        status = _value(getattr(command, "status", None))

        if status in pending_statuses:
            pending_commands += 1
        elif status == "success":
            success_commands += 1
        elif status in failed_statuses:
            failed_commands += 1

    return {
        "totalAgents": len(agents),
        "onlineAgents": online_agents,
        "offlineOrRevokedAgents": offline_or_revoked_agents,
        "pendingCommands": pending_commands,
        "successCommands": success_commands,
        "failedCommands": failed_commands,
        "totalCommands": len(commands),
        "totalTags": 0,
        "totalGroups": 0,
        "generatedAt": now.isoformat(),
    }
