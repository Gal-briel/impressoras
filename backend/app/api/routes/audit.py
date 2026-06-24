# backend/app/api/routes/audit.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user
from app.infrastructure.database.models import AuditLog, User

router = APIRouter(prefix="/audit", tags=["audit"])


def _audit_to_dict(log: AuditLog, user_email: str | None = None) -> dict:
    return {
        "id": log.id,
        "tenant_id": log.tenant_id,
        "user_id": log.user_id,
        "user_email": user_email,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "metadata_payload": log.metadata_payload,
        "ip_address": log.ip_address,
        "created_at": log.created_at,
    }


@router.get("")
async def list_audit_logs(
    action: str | None = None,
    user: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(AuditLog, User.email)
        .join(User, AuditLog.user_id == User.id)
        .where(AuditLog.tenant_id == UUID(current_user.tenant_id))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if user:
        pattern = f"%{user}%"
        stmt = stmt.where(or_(User.email.ilike(pattern), cast(AuditLog.user_id, String).ilike(pattern)))
    result = await session.execute(stmt)
    items = [_audit_to_dict(log, email) for log, email in result.all()]
    return {"items": items, "total": len(items)}


@router.get("/{audit_id}")
async def get_audit_log(
    audit_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(AuditLog, User.email)
        .join(User, AuditLog.user_id == User.id)
        .where(AuditLog.id == audit_id, AuditLog.tenant_id == UUID(current_user.tenant_id))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log not found")
    log, email = row
    return _audit_to_dict(log, email)
