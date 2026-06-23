# backend/app/services/agent_service.py
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.schemas.agent_schemas import AgentCheckInRequest, AgentListResponse, AgentResponse, AgentTagResponse
from app.core.redis import redis_client
from app.core.security import generate_api_key, get_api_key_hash
from app.infrastructure.database.enums import EnrollmentStatus, EventSeverity
from app.infrastructure.database.models import Agent
from app.repositories.base import BaseRepository
from app.services.agent_event_service import AgentEventService
from app.services.agent_presence import AgentPresenceService
from app.websocket.manager import websocket_manager


class AgentService:
    def __init__(self, repository: BaseRepository):
        self.repository = repository

    @staticmethod
    def is_revoked(agent: Agent) -> bool:
        return bool(agent.revoked_at) or agent.enrollment_status == EnrollmentStatus.REVOKED

    async def list_agents(
        self,
        tenant_id: UUID,
        page: int = 1,
        limit: int = 50,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> AgentListResponse:
        page = max(page, 1)
        limit = min(max(limit, 1), 200)
        offset = (page - 1) * limit

        filters = [Agent.tenant_id == tenant_id, Agent.deleted_at.is_(None)]

        if search:
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    Agent.hostname.ilike(term),
                    Agent.mac_address.ilike(term),
                    Agent.last_ip.ilike(term),
                )
            )

        total_result = await self.repository.session.execute(
            select(func.count()).select_from(Agent).where(*filters)
        )
        total = int(total_result.scalar_one() or 0)

        result = await self.repository.session.execute(
            select(Agent)
            .options(selectinload(Agent.tags))
            .where(*filters)
            .order_by(Agent.hostname.asc())
            .offset(offset)
            .limit(limit)
        )
        agents = list(result.scalars().all())

        mapped = [await self._map_to_response(agent) for agent in agents]
        if status_filter:
            mapped = [agent for agent in mapped if agent.calculated_status.value == status_filter or agent.calculated_status == status_filter]
            total = len(mapped)

        return AgentListResponse(items=mapped, total=total)

    async def process_check_in(self, agent_id: UUID, check_in_data: AgentCheckInRequest) -> dict:
        agent = await self.repository.get(agent_id)
        if not agent:
            return {"error": "Agent not found"}

        if self.is_revoked(agent):
            return {"error": "Agent revoked"}

        update_data = {
            "agent_version": check_in_data.agent_version,
            "last_ip": check_in_data.internal_ip or agent.last_ip,
            "last_seen": datetime.now(timezone.utc),
        }

        await self.repository.update(agent, update_data)
        await self.repository.session.commit()

        if redis_client.client:
            await redis_client.client.setex(
                name=f"agent:presence:{str(agent_id)}",
                time=60,
                value="1",
            )

        return {"pending_commands": 0}

    async def register_heartbeat(self, agent_id: UUID) -> None:
        now = datetime.now(timezone.utc)
        agent = await self.repository.get(agent_id)
        if agent and not self.is_revoked(agent):
            await self.repository.update(agent, {"last_seen": now})
            await self.repository.session.commit()

            if redis_client.client:
                await redis_client.client.setex(
                    name=f"agent:presence:{str(agent_id)}",
                    time=60,
                    value="1",
                )

            await websocket_manager.broadcast_event(
                str(agent.tenant_id),
                "agent_online",
                {"agent_id": str(agent_id)},
            )

    async def _map_to_response(self, agent: Agent) -> AgentResponse:
        calculated_status = await AgentPresenceService.calculate_status(
            agent_id=agent.id,
            last_seen=agent.last_seen,
        )

        loaded_tags = agent.__dict__.get("tags") or []
        tag_responses = [
            AgentTagResponse.model_validate(tag)
            for tag in loaded_tags
            if getattr(tag, "deleted_at", None) is None
        ]

        return AgentResponse(
            id=agent.id,
            tenant_id=agent.tenant_id,
            group_id=agent.group_id,
            hostname=agent.hostname,
            mac_address=agent.mac_address,
            os_version=agent.os_version,
            agent_version=agent.agent_version,
            last_ip=agent.last_ip,
            enrollment_status=agent.enrollment_status,
            capabilities=agent.capabilities or [],
            last_seen=agent.last_seen,
            calculated_status=calculated_status,
            created_at=agent.created_at,
            revoked_at=agent.revoked_at,
            revoked_by=agent.revoked_by,
            revoke_reason=agent.revoke_reason,
            tags=tag_responses,
        )

    async def get_agent(self, agent_id: UUID) -> Optional[AgentResponse]:
        result = await self.repository.session.execute(
            select(Agent).options(selectinload(Agent.tags)).where(Agent.id == agent_id)
        )
        agent = result.scalars().first()
        if not agent:
            return None
        return await self._map_to_response(agent)

    async def revoke_agent(
        self,
        agent_id: UUID,
        tenant_id: UUID,
        revoked_by: UUID,
        reason: Optional[str] = None,
    ) -> AgentResponse:
        agent = await self.repository.get(agent_id)
        if not agent:
            raise ValueError("Agent not found")
        if agent.tenant_id != tenant_id:
            raise PermissionError("Agent not found in current tenant")

        if not self.is_revoked(agent):
            now = datetime.now(timezone.utc)
            await self.repository.update(
                agent,
                {
                    "enrollment_status": EnrollmentStatus.REVOKED,
                    "revoked_at": now,
                    "revoked_by": revoked_by,
                    "revoke_reason": reason,
                },
            )
            await self.repository.session.commit()

            if redis_client.client:
                await redis_client.client.delete(f"agent:presence:{str(agent_id)}")

            await websocket_manager.close_agent_connection(str(agent_id), code=1008, reason="Agent revoked")
            await websocket_manager.broadcast_event(
                str(agent.tenant_id),
                "agent_revoked",
                {
                    "agent_id": str(agent.id),
                    "revoked_at": now.isoformat(),
                    "revoked_by": str(revoked_by),
                    "reason": reason,
                },
            )

            await AgentEventService.log_event(
                tenant_id=agent.tenant_id,
                agent_id=agent.id,
                event_type="agent_revoked",
                message=f"Agent access revoked. Reason: {reason}" if reason else "Agent access revoked.",
                severity=EventSeverity.WARNING,
            )

        return await self._map_to_response(agent)

    async def upgrade_api_key_hash(self, agent_id: UUID, plain_key: str) -> None:
        agent = await self.repository.get(agent_id)
        if agent and not self.is_revoked(agent):
            new_hash = get_api_key_hash(plain_key)
            await self.repository.update(agent, {"api_key_hash": new_hash})
            await self.repository.session.commit()

    async def rotate_credentials(self, agent_id: UUID) -> str:
        agent = await self.repository.get(agent_id)
        if not agent:
            raise ValueError("Agent not found")
        if self.is_revoked(agent):
            raise ValueError("Agent revoked")

        raw_new_key = generate_api_key()
        new_hash = get_api_key_hash(raw_new_key)

        await self.repository.update(agent, {"api_key_hash": new_hash})
        await self.repository.session.commit()

        await AgentEventService.log_event(
            tenant_id=agent.tenant_id,
            agent_id=agent.id,
            event_type="credential_rotated",
            message="API Key credentials successfully rotated. Previous key revoked.",
            severity=EventSeverity.WARNING,
        )

        return raw_new_key
