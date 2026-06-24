# backend/app/api/routes/printers.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user
from app.infrastructure.database.models import Agent, Printer

router = APIRouter(tags=["printers"])


def _printer_to_dict(printer: Printer, agent_hostname: str | None = None) -> dict:
    return {
        "id": printer.id,
        "tenant_id": printer.tenant_id,
        "agent_id": printer.agent_id,
        "agent_hostname": agent_hostname,
        "name": printer.name,
        "driver": printer.driver,
        "port": printer.port,
        "type": "default" if printer.is_default else "local",
        "is_default": printer.is_default,
        "status": printer.status,
        "created_at": printer.created_at,
    }


@router.get("/printers")
async def list_printers(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(Printer, Agent.hostname)
        .join(Agent, Printer.agent_id == Agent.id)
        .where(Printer.tenant_id == UUID(current_user.tenant_id))
        .order_by(Printer.created_at.desc())
        .limit(limit)
    )
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Printer.name.ilike(pattern),
                Printer.driver.ilike(pattern),
                Printer.port.ilike(pattern),
                Agent.hostname.ilike(pattern),
            )
        )
    if status_filter:
        stmt = stmt.where(Printer.status == status_filter)

    result = await session.execute(stmt)
    items = [_printer_to_dict(printer, hostname) for printer, hostname in result.all()]
    return {"items": items, "total": len(items)}


@router.get("/agents/{agent_id}/printers")
async def list_agent_printers(
    agent_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    agent_result = await session.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == UUID(current_user.tenant_id))
    )
    agent = agent_result.scalars().first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    result = await session.execute(
        select(Printer).where(Printer.agent_id == agent_id, Printer.tenant_id == UUID(current_user.tenant_id)).order_by(Printer.name)
    )
    items = [_printer_to_dict(printer, agent.hostname) for printer in result.scalars().all()]
    return {"items": items, "total": len(items)}
