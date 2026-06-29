# backend/app/services/agent_presence.py
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.core.redis import redis_client
from app.domain.enums import AgentStatus


class AgentPresenceService:
    """Calcula status do agente com Redis opcional e fallback pelo last_seen."""

    @staticmethod
    async def calculate_status(agent_id: UUID, last_seen: Optional[datetime]) -> AgentStatus:
        if await redis_client.safe_exists(f"agent:presence:{str(agent_id)}"):
            return AgentStatus.ONLINE

        if not last_seen:
            return AgentStatus.UNKNOWN

        now = datetime.now(timezone.utc)
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)

        delta_seconds = (now - last_seen).total_seconds()

        if delta_seconds <= 60:
            return AgentStatus.ONLINE

        return AgentStatus.OFFLINE
