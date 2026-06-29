# backend/app/api/routes/commands.py
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import (
    CurrentUser,
    get_command_service,
    get_current_user,
    require_permissions,
)
from app.infrastructure.database.models import Agent, Command
from app.infrastructure.database.enums import CommandStatus
from app.schemas.command import CommandCreate, CommandResponse
from app.services.command_service import CommandService
from app.core.dependencies import require_agent_auth

router = APIRouter(tags=["commands"])


def _safe_status(command: Command) -> str:
    status_value = command.status

    if hasattr(status_value, "value"):
        return str(status_value.value)

    return str(status_value)


def _safe_datetime(command: Command, field_name: str):
    return getattr(command, field_name, None)


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
        "type": command.command_type,
        "payload": command.payload or {},
        "status": _safe_status(command),
        "timeout_seconds": command.timeout_seconds,
        "created_at": command.created_at,
        "updated_at": getattr(command, "updated_at", None),
        "expires_at": command.expires_at,
        "dispatched_at": _safe_datetime(command, "dispatched_at"),
        "started_at": _safe_datetime(command, "started_at"),
        "finished_at": _safe_datetime(command, "finished_at"),
        "output": getattr(command, "output", None),
        "result": getattr(command, "output", None),
        "error_code": getattr(command, "error_code", None),
        "error_message": getattr(command, "error_code", None),
        "retry_count": getattr(command, "retry_count", 0),
        "max_retries": getattr(command, "max_retries", 0),
    }


@router.get("/commands")
async def list_commands(
    status_filter: str | None = Query(default=None, alias="status"),
    agent_id: UUID | None = Query(default=None),
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

    if agent_id:
        stmt = stmt.where(Command.agent_id == agent_id)

    if status_filter:
        stmt = stmt.where(Command.status == status_filter)

    result = await session.execute(stmt)
    rows = result.all()

    items = [
        _command_to_dict(command, agent_hostname)
        for command, agent_hostname in rows
    ]

    return {
        "items": items,
        "total": len(items),
    }


@router.get("/commands/{command_id}")
async def get_command(
    command_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Command, Agent.hostname)
        .join(Agent, Command.agent_id == Agent.id)
        .where(
            Command.id == command_id,
            Command.tenant_id == UUID(current_user.tenant_id),
        )
    )

    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Command not found",
        )

    command, agent_hostname = row

    return _command_to_dict(command, agent_hostname)


@router.get("/agents/{agent_id}/commands")
async def list_agent_commands(
    agent_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Command, Agent.hostname)
        .join(Agent, Command.agent_id == Agent.id)
        .where(
            Command.agent_id == agent_id,
            Command.tenant_id == UUID(current_user.tenant_id),
        )
        .order_by(Command.created_at.desc())
        .limit(limit)
    )

    rows = result.all()

    items = [
        _command_to_dict(command, agent_hostname)
        for command, agent_hostname in rows
    ]

    return {
        "items": items,
        "total": len(items),
    }


@router.post(
    "/agents/{agent_id}/commands",
    response_model=CommandResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
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


@router.get("/agent/commands/pending")
async def agent_list_pending_commands(
    limit: int = Query(default=5, ge=1, le=25),
    agent_id: str = Depends(require_agent_auth),
    session: AsyncSession = Depends(get_db_session),
):
    agent_uuid = UUID(agent_id)
    now = datetime.now(timezone.utc)

    result = await session.execute(
        select(Command)
        .where(
            Command.agent_id == agent_uuid,
            Command.status.in_([
                CommandStatus.QUEUED.value,
                CommandStatus.DISPATCHED.value,
            ]),
            Command.expires_at > now,
        )
        .order_by(Command.created_at.asc())
        .limit(limit)
    )

    commands = list(result.scalars().all())

    for command in commands:
        if str(command.status) == CommandStatus.QUEUED.value:
            command.status = CommandStatus.DISPATCHED.value

    await session.commit()

    return {
        "items": [
            {
                "id": str(command.id),
                "agent_id": str(command.agent_id),
                "command_type": command.command_type,
                "payload": command.payload or {},
                "status": str(command.status.value if hasattr(command.status, "value") else command.status),
                "correlation_id": command.correlation_id,
                "expires_at": command.expires_at,
                "timeout_seconds": command.timeout_seconds,
            }
            for command in commands
        ],
        "total": len(commands),
    }


@router.post("/agent/commands/{command_id}/status")
async def agent_update_command_status(
    command_id: UUID,
    payload: dict = Body(...),
    agent_id: str = Depends(require_agent_auth),
    command_service: CommandService = Depends(get_command_service),
    session: AsyncSession = Depends(get_db_session),
):
    agent_uuid = UUID(agent_id)

    result = await session.execute(
        select(Command).where(
            Command.id == command_id,
            Command.agent_id == agent_uuid,
        )
    )

    command = result.scalar_one_or_none()

    if not command:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Command not found",
        )

    received_status = str(payload.get("status", "")).lower()
    output = payload.get("output")
    error_code = payload.get("error_code")

    if received_status in ["ack", "acknowledged"]:
        await command_service.update_status_idempotent(
            command_id=command_id,
            new_status=CommandStatus.ACKNOWLEDGED,
            output=output,
            error_code=error_code,
        )
        return {"status": "accepted"}

    if received_status in ["started", "executing"]:
        await command_service.update_status_idempotent(
            command_id=command_id,
            new_status=CommandStatus.EXECUTING,
            output=output,
            error_code=error_code,
        )
        return {"status": "accepted"}

    if received_status in ["success", "succeeded", "finished", "completed"]:
        await command_service.handle_command_completion(
            command_id=command_id,
            payload_status="SUCCESS",
            output=output,
            error_code=error_code,
        )
        return {"status": "accepted"}

    if received_status in ["failed", "failure", "error"]:
        await command_service.handle_command_completion(
            command_id=command_id,
            payload_status="FAILED",
            output=output,
            error_code=error_code or "AGENT_COMMAND_FAILED",
        )
        return {"status": "accepted"}

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Invalid command status",
    )

