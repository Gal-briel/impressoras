# backend/app/api/routes/agent_groups.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.schemas.agent_schemas import (
    AgentGroupCreateRequest,
    AgentGroupListResponse,
    AgentGroupResponse,
    AgentGroupUpdateRequest,
)
from app.core.dependencies import CurrentUser, get_agent_group_service, get_current_user
from app.services.agent_group_service import AgentGroupService

router = APIRouter(prefix="/agent-groups", tags=["agent-groups"])


@router.get("", response_model=AgentGroupListResponse)
async def list_agent_groups(
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    return await group_service.list_groups(tenant_id=UUID(current_user.tenant_id))


@router.post("", response_model=AgentGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_group(
    payload: AgentGroupCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        return await group_service.create_group(
            tenant_id=UUID(current_user.tenant_id),
            name=payload.name,
            description=payload.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{group_id}", response_model=AgentGroupResponse)
async def get_agent_group(
    group_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        return await group_service.get_group(tenant_id=UUID(current_user.tenant_id), group_id=group_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")


@router.patch("/{group_id}", response_model=AgentGroupResponse)
async def update_agent_group(
    group_id: UUID,
    payload: AgentGroupUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        return await group_service.update_group(
            tenant_id=UUID(current_user.tenant_id),
            group_id=group_id,
            name=payload.name,
            description=payload.description,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "Group not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_group(
    group_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        await group_service.delete_group(tenant_id=UUID(current_user.tenant_id), group_id=group_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
