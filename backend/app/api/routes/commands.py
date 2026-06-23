# app/api/routes/commands.py
from uuid import UUID
from fastapi import APIRouter, Depends, status
from app.schemas.command import CommandCreate, CommandResponse
from app.services.command_service import CommandService
from app.core.dependencies import get_command_service, CurrentUser, require_permissions

router = APIRouter(prefix="/agents/{agent_id}/commands", tags=["commands"])

@router.post("", response_model=CommandResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_command(
    agent_id: UUID,
    command_in: CommandCreate,
    current_user: CurrentUser = Depends(require_permissions(["commands:execute"])),
    command_service: CommandService = Depends(get_command_service)
):
    return await command_service.dispatch_command(
        tenant_id=UUID(current_user.tenant_id),
        agent_id=agent_id,
        user_id=UUID(current_user.id),
        command_in=command_in
    )