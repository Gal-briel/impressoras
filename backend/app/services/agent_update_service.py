# backend/app/services/agent_update_service.py
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.agent_schemas import AgentVersionResponse
from app.infrastructure.database.models import AgentRelease


class AgentUpdateService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_latest_release_for_agent(
        self,
        tenant_id: UUID,
        current_version: str,
        channel: str = "stable",
        platform: str = "windows",
    ) -> AgentVersionResponse:
        result = await self.session.execute(
            select(AgentRelease)
            .where(
                AgentRelease.platform == platform,
                AgentRelease.channel == channel,
                AgentRelease.is_active.is_(True),
                AgentRelease.deleted_at.is_(None),
                or_(AgentRelease.tenant_id.is_(None), AgentRelease.tenant_id == tenant_id),
            )
            .order_by(AgentRelease.tenant_id.desc().nulls_last(), AgentRelease.created_at.desc())
        )
        releases = list(result.scalars().all())
        if not releases:
            return AgentVersionResponse(
                update_available=False,
                current_version=current_version,
                latest_version=current_version,
            )

        newer_releases = [release for release in releases if self._is_version_newer(release.version, current_version)]
        if not newer_releases:
            return AgentVersionResponse(
                update_available=False,
                current_version=current_version,
                latest_version=releases[0].version,
            )

        selected = newer_releases[0]
        return AgentVersionResponse(
            update_available=True,
            current_version=current_version,
            latest_version=selected.version,
            mandatory=selected.mandatory,
            package_url=selected.package_url,
            package_sha256=selected.package_sha256,
            signature_thumbprint=selected.signature_thumbprint,
            rollback_package_url=selected.rollback_package_url,
            rollback_package_sha256=selected.rollback_package_sha256,
            notes=selected.notes,
        )

    @staticmethod
    def _is_version_newer(candidate: str, current: str) -> bool:
        return AgentUpdateService._version_tuple(candidate) > AgentUpdateService._version_tuple(current)

    @staticmethod
    def _version_tuple(version: str) -> tuple[int, ...]:
        clean = version.split("-", 1)[0]
        parts = []
        for part in clean.split("."):
            try:
                parts.append(int(part))
            except ValueError:
                parts.append(0)
        return tuple(parts)
