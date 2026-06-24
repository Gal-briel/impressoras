# backend/app/api/routes/commands.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_command_service, get_current_user, require_permissions
from app.infrastructure.database.models import Agent, Command
from app.schemas.command import CommandCreate, CommandResponse
from app.services.command_service import CommandService

router = APIRouter(tags=["commands"])


def _command_to_dict(command: Command, agent_hostname: str | None = None) -> dict:
    return {
        "id": command.id,
        "tenant_id": command.tenant_id,
        "agent_id": command.agent_id,
        "agent_hostname": agent_hostname,
        "user_id": command.user_id,
        "correlation_id": command.correlation_id,
        "idempotency_key": command.idempotency_key,
        "command_type": command.command_type,
        "payload": command.payload,
        "status": str(command.status.value if hasattr(command.status, "value") else command.status),
        "timeout_seconds": command.timeout_seconds,
        "created_at": command.created_at,
        "expires_at": command.expires_at,
        "output": command.output,
        "error_code": command.error_code,
    }


@router.get("/commands")
async def list_commands(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(Command, Agent.hostname)
        .join(Agent, Command.agent_id == Agent.id)
        .where(Command.tenant_id == UUID(current_user.tenant_id))
        .order_by(Command.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(Command.status == status_filter)
    result = await session.execute(stmt)
    items = [_command_to_dict(command, hostname) for command, hostname in result.all()]
    return {"items": items, "total": len(items)}


@router.get("/commands/{command_id}")
async def get_command(
    command_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Command, Agent.hostname)
        .join(Agent, Command.agent_id == Agent.id)
        .where(Command.id == command_id, Command.tenant_id == UUID(current_user.tenant_id))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    command, hostname = row
    return _command_to_dict(command, hostname)


@router.get("/agents/{agent_id}/commands")
async def list_agent_commands(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Command, Agent.hostname)
        .join(Agent, Command.agent_id == Agent.id)
        .where(Command.agent_id == agent_id, Command.tenant_id == UUID(current_user.tenant_id))
        .order_by(Command.created_at.desc())
        .limit(100)
    )
    items = [_command_to_dict(command, hostname) for command, hostname in result.all()]
    return {"items": items, "total": len(items)}


@router.post("/agents/{agent_id}/commands", response_model=CommandResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_command(
    agent_id: UUID,
    command_in: CommandCreate,
    current_user: CurrentUser = Depends(require_permissions(["commands:execute"])),
    command_service: CommandService = Depends(get_command_service),
):
    return await command_service.dispatch_command(
        tenant_id=UUID(current_user.tenant_id),
        agent_id=agent_id,
        user_id=UUID(current_user.id),
        command_in=command_in,
    )
