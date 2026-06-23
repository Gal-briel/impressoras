# backend/app/services/agent_tag_service.py
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.agent_schemas import AgentTagListResponse, AgentTagResponse
from app.infrastructure.database.models import Agent, AgentTag, AgentTagAssignment


class AgentTagService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def normalize_name(name: str) -> str:
        return " ".join(name.strip().split()).lower()

    async def list_tags(self, tenant_id: UUID) -> AgentTagListResponse:
        result = await self.session.execute(
            select(AgentTag)
            .where(AgentTag.tenant_id == tenant_id, AgentTag.deleted_at.is_(None))
            .order_by(AgentTag.name.asc())
        )
        tags = list(result.scalars().all())
        return AgentTagListResponse(items=[AgentTagResponse.model_validate(tag) for tag in tags], total=len(tags))

    async def create_tag(self, tenant_id: UUID, name: str) -> AgentTagResponse:
        clean_name = " ".join(name.strip().split())
        if not clean_name:
            raise ValueError("Tag name cannot be empty")

        normalized_name = self.normalize_name(clean_name)
        result = await self.session.execute(
            select(AgentTag).where(
                AgentTag.tenant_id == tenant_id,
                AgentTag.normalized_name == normalized_name,
            )
        )
        existing_tag = result.scalars().first()
        if existing_tag:
            if existing_tag.deleted_at is not None:
                existing_tag.deleted_at = None
                existing_tag.name = clean_name
                self.session.add(existing_tag)
                await self.session.commit()
                await self.session.refresh(existing_tag)
            return AgentTagResponse.model_validate(existing_tag)

        tag = AgentTag(tenant_id=tenant_id, name=clean_name, normalized_name=normalized_name)
        self.session.add(tag)
        await self.session.commit()
        await self.session.refresh(tag)
        return AgentTagResponse.model_validate(tag)

    async def delete_tag(self, tenant_id: UUID, tag_id: UUID) -> None:
        result = await self.session.execute(
            select(AgentTag).where(
                AgentTag.id == tag_id,
                AgentTag.tenant_id == tenant_id,
                AgentTag.deleted_at.is_(None),
            )
        )
        tag = result.scalars().first()
        if not tag:
            raise ValueError("Tag not found")

        tag.deleted_at = datetime.now(timezone.utc)
        await self.session.execute(
            delete(AgentTagAssignment).where(
                AgentTagAssignment.tenant_id == tenant_id,
                AgentTagAssignment.tag_id == tag_id,
            )
        )
        self.session.add(tag)
        await self.session.commit()

    async def get_agent_tags(self, tenant_id: UUID, agent_id: UUID) -> AgentTagListResponse:
        await self._ensure_agent_belongs_to_tenant(tenant_id, agent_id)
        result = await self.session.execute(
            select(AgentTag)
            .join(AgentTagAssignment, AgentTagAssignment.tag_id == AgentTag.id)
            .where(
                AgentTagAssignment.tenant_id == tenant_id,
                AgentTagAssignment.agent_id == agent_id,
                AgentTag.tenant_id == tenant_id,
                AgentTag.deleted_at.is_(None),
            )
            .order_by(AgentTag.name.asc())
        )
        tags = list(result.scalars().all())
        return AgentTagListResponse(items=[AgentTagResponse.model_validate(tag) for tag in tags], total=len(tags))

    async def replace_agent_tags(self, tenant_id: UUID, agent_id: UUID, tag_ids: List[UUID]) -> AgentTagListResponse:
        await self._ensure_agent_belongs_to_tenant(tenant_id, agent_id)
        unique_tag_ids = list(dict.fromkeys(tag_ids))

        if unique_tag_ids:
            result = await self.session.execute(
                select(AgentTag).where(
                    AgentTag.tenant_id == tenant_id,
                    AgentTag.id.in_(unique_tag_ids),
                    AgentTag.deleted_at.is_(None),
                )
            )
            found_tag_ids = {tag.id for tag in result.scalars().all()}
            if any(tag_id not in found_tag_ids for tag_id in unique_tag_ids):
                raise ValueError("One or more tags were not found")

        await self.session.execute(
            delete(AgentTagAssignment).where(
                AgentTagAssignment.tenant_id == tenant_id,
                AgentTagAssignment.agent_id == agent_id,
            )
        )

        for tag_id in unique_tag_ids:
            self.session.add(AgentTagAssignment(tenant_id=tenant_id, agent_id=agent_id, tag_id=tag_id))

        await self.session.commit()
        return await self.get_agent_tags(tenant_id, agent_id)

    async def _ensure_agent_belongs_to_tenant(self, tenant_id: UUID, agent_id: UUID) -> Agent:
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
