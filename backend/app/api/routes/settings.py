# backend/app/api/routes/settings.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, require_permissions
from app.core.security import get_password_hash
from app.infrastructure.database.enums import UserStatus
from app.infrastructure.database.models import Permission, Role, Tenant, User, role_permissions

router = APIRouter(prefix="/settings", tags=["settings"])


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role_id: UUID
    status: str = UserStatus.ACTIVE.value


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    role_id: Optional[UUID] = None
    status: Optional[str] = None


def _status_value(value) -> str:
    return str(value.value if hasattr(value, "value") else value)


def _user_to_dict(user: User, role_name: str | None = None) -> dict:
    return {
        "id": user.id,
        "tenant_id": user.tenant_id,
        "role_id": user.role_id,
        "role_name": role_name,
        "email": user.email,
        "status": _status_value(user.status),
        "created_at": user.created_at,
    }


async def _role_permissions(session: AsyncSession, role_id: UUID) -> list[str]:
    result = await session.execute(
        select(Permission.name)
        .select_from(role_permissions.join(Permission, role_permissions.c.permission_id == Permission.id))
        .where(role_permissions.c.role_id == role_id)
    )
    permissions = list(result.scalars().all())
    expanded = set(permissions)
    for permission in permissions:
        expanded.add(permission.replace(":", "."))
    return sorted(expanded)


@router.get("/users")
async def list_users(
    current_user: CurrentUser = Depends(require_permissions(["users.manage"])),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(User, Role.name)
        .join(Role, User.role_id == Role.id)
        .where(User.tenant_id == UUID(current_user.tenant_id))
        .order_by(User.email)
    )
    items = [_user_to_dict(user, role_name) for user, role_name in result.all()]
    return {"items": items, "total": len(items)}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateRequest,
    current_user: CurrentUser = Depends(require_permissions(["users.manage"])),
    session: AsyncSession = Depends(get_db_session),
):
    role_result = await session.execute(
        select(Role).where(Role.id == payload.role_id, Role.tenant_id == UUID(current_user.tenant_id))
    )
    role = role_result.scalars().first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    exists = await session.execute(
        select(User).where(User.email == payload.email, User.tenant_id == UUID(current_user.tenant_id))
    )
    if exists.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")

    user = User(
        tenant_id=UUID(current_user.tenant_id),
        role_id=payload.role_id,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        status=payload.status,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _user_to_dict(user, role.name)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    current_user: CurrentUser = Depends(require_permissions(["users.manage"])),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(User, Role.name)
        .join(Role, User.role_id == Role.id)
        .where(User.id == user_id, User.tenant_id == UUID(current_user.tenant_id))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user, role_name = row
    if payload.email is not None:
        user.email = payload.email
    if payload.role_id is not None:
        role_result = await session.execute(
            select(Role).where(Role.id == payload.role_id, Role.tenant_id == UUID(current_user.tenant_id))
        )
        role = role_result.scalars().first()
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        user.role_id = payload.role_id
        role_name = role.name
    if payload.status is not None:
        user.status = payload.status
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _user_to_dict(user, role_name)


@router.get("/roles")
async def list_roles(
    current_user: CurrentUser = Depends(require_permissions(["settings.read"])),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Role).where(Role.tenant_id == UUID(current_user.tenant_id)).order_by(Role.name)
    )
    roles = result.scalars().all()
    items = []
    for role in roles:
        items.append(
            {
                "id": role.id,
                "tenant_id": role.tenant_id,
                "name": role.name,
                "description": role.description,
                "permissions": await _role_permissions(session, role.id),
            }
        )
    return {"items": items, "total": len(items)}


@router.get("/tenants")
async def list_tenants(
    current_user: CurrentUser = Depends(require_permissions(["settings.read"])),
    session: AsyncSession = Depends(get_db_session),
):
    # Owner/Admin do tenant enxerga o tenant atual. A estrutura fica pronta para expansão global.
    result = await session.execute(
        select(Tenant).where(Tenant.id == UUID(current_user.tenant_id)).order_by(Tenant.name)
    )
    tenants = result.scalars().all()
    items = [{"id": tenant.id, "name": tenant.name, "active": tenant.active, "created_at": tenant.created_at} for tenant in tenants]
    return {"items": items, "total": len(items)}
