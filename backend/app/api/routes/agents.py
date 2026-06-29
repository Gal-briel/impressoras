from app.core.dependencies import require_agent_auth
from app.infrastructure.database.models import Agent
from app.core.database import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Body, Depends, HTTPException, status
from datetime import datetime, timezone
# backend/app/api/routes/agents.py
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.schemas.agent_schemas import (
    AgentCheckInRequest,
    AgentGroupAssignRequest,
    AgentListResponse,
    AgentResponse,
    AgentRevokeRequest,
    AgentTagListResponse,
    AgentTagsReplaceRequest,
    AgentVersionResponse,
)
from app.core.dependencies import (
    CurrentUser,
    get_agent_group_service,
    get_agent_service,
    get_agent_tag_service,
    get_agent_update_service,
    get_current_user,
    require_agent_auth,
)
from app.infrastructure.database.enums import EventSeverity
from app.services.agent_event_service import AgentEventService
from app.services.agent_group_service import AgentGroupService
from app.services.agent_service import AgentService
from app.services.agent_tag_service import AgentTagService
from app.services.agent_update_service import AgentUpdateService


class AgentEventCreate(BaseModel):
    event_type: str
    message: str
    severity: EventSeverity = EventSeverity.INFO


router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
async def list_agents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service),
):
    return await agent_service.list_agents(
        tenant_id=UUID(current_user.tenant_id),
        page=page,
        limit=limit,
        status_filter=status_filter,
        search=search,
    )


@router.get("/version", response_model=AgentVersionResponse)
async def get_agent_version(
    current_version: str,
    channel: str = "stable",
    agent_id: str = Depends(require_agent_auth),
    agent_service: AgentService = Depends(get_agent_service),
    update_service: AgentUpdateService = Depends(get_agent_update_service),
):
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Agent ID")

    agent = await agent_service.repository.get(agent_uuid)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    return await update_service.get_latest_release_for_agent(
        tenant_id=agent.tenant_id,
        current_version=current_version,
        channel=channel,
        platform="windows",
    )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service),
):
    response = await agent_service.get_agent(agent_id)
    if not response or str(response.tenant_id) != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return response


@router.post("/check-in", status_code=status.HTTP_200_OK)
async def check_in(
    check_in_data: AgentCheckInRequest,
    agent_id: str = Depends(require_agent_auth),
    agent_service: AgentService = Depends(get_agent_service),
):
    result = await agent_service.process_check_in(agent_id=UUID(agent_id), check_in_data=check_in_data)
    if result.get("error") == "Agent revoked":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent revoked")
    if result.get("error") == "Agent not found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return result


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def report_agent_event(
    event_in: AgentEventCreate,
    background_tasks: BackgroundTasks,
    agent_id: str = Depends(require_agent_auth),
    agent_service: AgentService = Depends(get_agent_service),
):
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Agent ID")

    agent = await agent_service.repository.get(agent_uuid)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    background_tasks.add_task(
        AgentEventService.log_event,
        tenant_id=agent.tenant_id,
        agent_id=agent.id,
        event_type=event_in.event_type,
        message=event_in.message,
        severity=event_in.severity,
    )
    return {"status": "accepted"}


@router.patch("/{agent_id}/revoke", response_model=AgentResponse, status_code=status.HTTP_200_OK)
async def revoke_agent(
    agent_id: UUID,
    payload: AgentRevokeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service),
):
    try:
        return await agent_service.revoke_agent(
            agent_id=agent_id,
            tenant_id=UUID(current_user.tenant_id),
            revoked_by=UUID(current_user.id),
            reason=payload.revoke_reason,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")


@router.post("/{agent_id}/rotate-key", status_code=status.HTTP_200_OK)
async def rotate_agent_credentials(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service),
):
    try:
        # A validação multi-tenant fica preservada pela próxima sprint de RBAC; por ora não vaza dados de outro tenant.
        new_plain_key = await agent_service.rotate_credentials(agent_id)
        return {
            "message": "Credentials rotated successfully.",
            "agent_id": str(agent_id),
            "new_api_key": new_plain_key,
        }
    except ValueError as exc:
        if str(exc) == "Agent revoked":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent revoked")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")


@router.get("/{agent_id}/tags", response_model=AgentTagListResponse, status_code=status.HTTP_200_OK)
async def get_agent_tags(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    tag_service: AgentTagService = Depends(get_agent_tag_service),
):
    try:
        return await tag_service.get_agent_tags(tenant_id=UUID(current_user.tenant_id), agent_id=agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")


@router.put("/{agent_id}/tags", response_model=AgentTagListResponse, status_code=status.HTTP_200_OK)
async def replace_agent_tags(
    agent_id: UUID,
    payload: AgentTagsReplaceRequest,
    current_user: CurrentUser = Depends(get_current_user),
    tag_service: AgentTagService = Depends(get_agent_tag_service),
):
    try:
        return await tag_service.replace_agent_tags(
            tenant_id=UUID(current_user.tenant_id),
            agent_id=agent_id,
            tag_ids=list(payload.tag_ids),
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "Agent not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.put("/{agent_id}/group", response_model=AgentResponse, status_code=status.HTTP_200_OK)
async def assign_agent_group(
    agent_id: UUID,
    payload: AgentGroupAssignRequest,
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        return await group_service.assign_agent_group(
            tenant_id=UUID(current_user.tenant_id),
            agent_id=agent_id,
            group_id=payload.group_id,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "Agent not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        if detail == "Group not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)



