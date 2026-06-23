# backend/app/services/agent_group_service.py
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas.agent_schemas import AgentGroupListResponse, AgentGroupResponse, AgentResponse
from app.infrastructure.database.models import Agent, AgentGroup
from app.repositories.base import BaseRepository
from app.services.agent_service import AgentService


class AgentGroupService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _clean_name(name: str) -> str:
        return " ".join(name.strip().split())

    @staticmethod
    def _map_group(group: AgentGroup) -> AgentGroupResponse:
        return AgentGroupResponse.model_validate(group)

    async def list_groups(self, tenant_id: UUID) -> AgentGroupListResponse:
        result = await self.session.execute(
            select(AgentGroup)
            .where(AgentGroup.tenant_id == tenant_id, AgentGroup.deleted_at.is_(None))
            .order_by(AgentGroup.name.asc())
        )
        groups = list(result.scalars().all())
        return AgentGroupListResponse(items=[self._map_group(group) for group in groups], total=len(groups))

    async def get_group(self, tenant_id: UUID, group_id: UUID) -> AgentGroupResponse:
        return self._map_group(await self._get_group_model(tenant_id, group_id))

    async def create_group(self, tenant_id: UUID, name: str, description: Optional[str] = None) -> AgentGroupResponse:
        clean_name = self._clean_name(name)
        if not clean_name:
            raise ValueError("Group name cannot be empty")

        existing_group = await self._find_group_by_name(tenant_id, clean_name)
        if existing_group:
            if existing_group.deleted_at is not None:
                existing_group.deleted_at = None
                existing_group.description = description
                self.session.add(existing_group)
                await self.session.commit()
                await self.session.refresh(existing_group)
                return self._map_group(existing_group)
            raise ValueError("Group already exists")

        group = AgentGroup(tenant_id=tenant_id, name=clean_name, description=description)
        self.session.add(group)
        await self.session.commit()
        await self.session.refresh(group)
        return self._map_group(group)

    async def update_group(
        self,
        tenant_id: UUID,
        group_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> AgentGroupResponse:
        group = await self._get_group_model(tenant_id, group_id)

        if name is not None:
            clean_name = self._clean_name(name)
            if not clean_name:
                raise ValueError("Group name cannot be empty")
            existing_group = await self._find_group_by_name(tenant_id, clean_name)
            if existing_group and existing_group.id != group.id:
                raise ValueError("Group already exists")
            group.name = clean_name

        if description is not None:
            group.description = description

        self.session.add(group)
        await self.session.commit()
        await self.session.refresh(group)
        return self._map_group(group)

    async def delete_group(self, tenant_id: UUID, group_id: UUID) -> None:
        group = await self._get_group_model(tenant_id, group_id)
        group.deleted_at = datetime.now(timezone.utc)

        result = await self.session.execute(
            select(Agent).where(
                Agent.tenant_id == tenant_id,
                Agent.group_id == group_id,
                Agent.deleted_at.is_(None),
            )
        )
        for agent in result.scalars().all():
            agent.group_id = None
            self.session.add(agent)

        self.session.add(group)
        await self.session.commit()

    async def assign_agent_group(self, tenant_id: UUID, agent_id: UUID, group_id: Optional[UUID]) -> AgentResponse:
        agent = await self._get_agent_model(tenant_id, agent_id)
        if group_id is not None:
            await self._get_group_model(tenant_id, group_id)
        agent.group_id = group_id
        self.session.add(agent)
        await self.session.commit()
        await self.session.refresh(agent)

        result = await self.session.execute(
            select(Agent).options(selectinload(Agent.tags)).where(Agent.id == agent.id)
        )
        refreshed_agent = result.scalars().first() or agent
        return await AgentService(BaseRepository(Agent, self.session))._map_to_response(refreshed_agent)

    async def _get_group_model(self, tenant_id: UUID, group_id: UUID) -> AgentGroup:
        result = await self.session.execute(
            select(AgentGroup).where(
                AgentGroup.id == group_id,
                AgentGroup.tenant_id == tenant_id,
                AgentGroup.deleted_at.is_(None),
            )
        )
        group = result.scalars().first()
        if not group:
            raise ValueError("Group not found")
        return group

    async def _get_agent_model(self, tenant_id: UUID, agent_id: UUID) -> Agent:
        result = await self.session.execute(
            select(Agent).where(
                Agent.id == agent_id,
                Agent.tenant_id == tenant_id,
                Agent.deleted_at.is_(None),
            )
        )
        agent = result.scalars().first()
        if not agent:
            raise ValueError("Agent not found")
        return agent

    async def _find_group_by_name(self, tenant_id: UUID, name: str) -> Optional[AgentGroup]:
        result = await self.session.execute(
            select(AgentGroup).where(
                AgentGroup.tenant_id == tenant_id,
                func.lower(AgentGroup.name) == name.lower(),
            )
        )
        return result.scalars().first()
