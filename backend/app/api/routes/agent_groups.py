# backend/app/api/routes/agent_groups.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas.agent_schemas import (
    AgentGroupCreateRequest,
    AgentGroupListResponse,
    AgentGroupResponse,
    AgentGroupUpdateRequest,
)
from app.core.dependencies import CurrentUser, get_agent_group_service, get_current_user, require_permissions
from app.services.agent_group_service import AgentGroupService
from app.services.audit_service import get_request_ip, log_audit_event

router = APIRouter(prefix="/agent-groups", tags=["agent-groups"])


@router.get("", response_model=AgentGroupListResponse)
async def list_agent_groups(
    current_user: CurrentUser = Depends(require_permissions(["agents:read"])),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    return await group_service.list_groups(tenant_id=UUID(current_user.tenant_id))


@router.post("", response_model=AgentGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_group(
    payload: AgentGroupCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_permissions(["agent-groups:write"])),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        result = await group_service.create_group(
            tenant_id=UUID(current_user.tenant_id),
            name=payload.name,
            description=payload.description,
        )

        await log_audit_event(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            action="agent_group_created",
            target_type="agent_group",
            target_id=result.id,
            ip_address=get_request_ip(request),
            metadata_payload={"name": result.name, "description": result.description},
        )

        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{group_id}", response_model=AgentGroupResponse)
async def get_agent_group(
    group_id: UUID,
    current_user: CurrentUser = Depends(require_permissions(["agents:read"])),
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
    request: Request,
    current_user: CurrentUser = Depends(require_permissions(["agent-groups:write"])),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        result = await group_service.update_group(
            tenant_id=UUID(current_user.tenant_id),
            group_id=group_id,
            name=payload.name,
            description=payload.description,
        )

        await log_audit_event(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            action="agent_group_updated",
            target_type="agent_group",
            target_id=group_id,
            ip_address=get_request_ip(request),
            metadata_payload={"name": payload.name, "description": payload.description},
        )

        return result
    except ValueError as exc:
        detail = str(exc)
        if detail == "Group not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_group(
    group_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(require_permissions(["agent-groups:write"])),
    group_service: AgentGroupService = Depends(get_agent_group_service),
):
    try:
        await group_service.delete_group(tenant_id=UUID(current_user.tenant_id), group_id=group_id)

        await log_audit_event(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            action="agent_group_deleted",
            target_type="agent_group",
            target_id=group_id,
            ip_address=get_request_ip(request),
            metadata_payload={},
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
