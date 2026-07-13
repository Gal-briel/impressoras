from typing import Callable
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session, set_tenant_context
from app.core.security import verify_api_key
from app.infrastructure.database.enums import EnrollmentStatus
from app.infrastructure.database.models import Agent, AuditLog
from app.repositories.base import BaseRepository
from app.repositories.command_repository import CommandRepository
from app.services.agent_group_service import AgentGroupService
from app.services.agent_service import AgentService
from app.services.agent_tag_service import AgentTagService
from app.services.agent_update_service import AgentUpdateService
from app.services.command_service import CommandService

security = HTTPBearer()


class CurrentUser:
    def __init__(self, id: str, tenant_id: str, permissions: list[str]):
        self.id = id
        self.tenant_id = tenant_id
        self.permissions = permissions


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> CurrentUser:
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")
        permissions: list[str] = payload.get("permissions", [])
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return CurrentUser(id=user_id, tenant_id=tenant_id, permissions=permissions)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")


def _permission_aliases(permission: str) -> set[str]:
    return {
        permission,
        permission.replace(":", "."),
        permission.replace(".", ":"),
    }


def require_permissions(required_permissions: list[str]) -> Callable:
    async def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        granted_permissions = set(current_user.permissions)

        for permission in required_permissions:
            if not (_permission_aliases(permission) & granted_permissions):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not enough permissions",
                )

        return current_user

    return dependency


async def get_tenant_session(
    session: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> AsyncSession:
    await set_tenant_context(session, current_user.tenant_id)
    return session


def get_agent_service(session: AsyncSession = Depends(get_db_session)) -> AgentService:
    return AgentService(BaseRepository(Agent, session))


def get_agent_tag_service(session: AsyncSession = Depends(get_tenant_session)) -> AgentTagService:
    return AgentTagService(session)


def get_agent_group_service(session: AsyncSession = Depends(get_tenant_session)) -> AgentGroupService:
    return AgentGroupService(session)


def get_agent_update_service(session: AsyncSession = Depends(get_db_session)) -> AgentUpdateService:
    return AgentUpdateService(session)


def get_command_service(session: AsyncSession = Depends(get_db_session)) -> CommandService:
    repository = CommandRepository(session)
    audit_repository = BaseRepository(AuditLog, session)
    return CommandService(repository, audit_repository)


async def require_agent_auth(
    authorization: str | None = Header(default=None),
    x_agent_id: str | None = Header(default=None, alias="x-agent-id"),
    agent_service: AgentService = Depends(get_agent_service),
) -> str:
    """Autentica chamadas do agente Windows.

    Formato esperado:
      Authorization: ApiKey <chave>
      x-agent-id: <uuid-do-agente>

    Regra de produção:
      - o agent_id precisa existir;
      - o agente precisa estar aprovado;
      - o agente não pode estar revogado;
      - a API key enviada precisa bater com o api_key_hash do agente.
    """

    if not x_agent_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-agent-id header")

    try:
        agent_uuid = UUID(str(x_agent_id))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid x-agent-id header")

    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    plain_api_key = token.strip()

    if scheme.lower() != "apikey" or not plain_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent authorization scheme")

    agent = await agent_service.repository.get(agent_uuid)

    if not agent:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent not found or revoked")

    enrollment_status = str(getattr(agent.enrollment_status, "value", agent.enrollment_status)).lower()

    if agent.revoked_at is not None or enrollment_status == "revoked":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent revoked")

    if enrollment_status != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent not approved")

    if not agent.api_key_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent API key not configured")

    if not verify_api_key(plain_api_key, agent.api_key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    return str(agent_uuid)
