# backend/app/api/routes/agent_tags.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.schemas.agent_schemas import AgentTagCreateRequest, AgentTagListResponse, AgentTagResponse
from app.core.dependencies import CurrentUser, get_agent_tag_service, get_current_user
from app.services.agent_tag_service import AgentTagService

router = APIRouter(prefix="/agent-tags", tags=["agent-tags"])


@router.get("", response_model=AgentTagListResponse)
async def list_agent_tags(
    current_user: CurrentUser = Depends(get_current_user),
    tag_service: AgentTagService = Depends(get_agent_tag_service),
):
    return await tag_service.list_tags(tenant_id=UUID(current_user.tenant_id))


@router.post("", response_model=AgentTagResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_tag(
    payload: AgentTagCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    tag_service: AgentTagService = Depends(get_agent_tag_service),
):
    try:
        return await tag_service.create_tag(tenant_id=UUID(current_user.tenant_id), name=payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_tag(
    tag_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    tag_service: AgentTagService = Depends(get_agent_tag_service),
):
    try:
        await tag_service.delete_tag(tenant_id=UUID(current_user.tenant_id), tag_id=tag_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
