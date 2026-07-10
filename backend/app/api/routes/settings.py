# backend/app/api/routes/settings.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
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
    password: Optional[str] = Field(default=None, min_length=6)


class RoleCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = None
    permissions: list[str] = Field(default_factory=list)


class RoleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = None
    permissions: Optional[list[str]] = None


def _status_value(value) -> str:
    return str(value.value if hasattr(value, "value") else value)


def _permission_variants(permission: str) -> set[str]:
    return {
        permission,
        permission.replace(":", "."),
        permission.replace(".", ":"),
    }


def _permission_area(permission: str) -> str:
    normalized = permission.replace(":", ".")
    return normalized.split(".", 1)[0] if "." in normalized else normalized


def _permission_action(permission: str) -> str:
    normalized = permission.replace(":", ".")
    return normalized.split(".", 1)[1] if "." in normalized else ""


def _permission_to_dict(permission: Permission) -> dict:
    return {
        "id": str(permission.id),
        "name": permission.name,
        "description": permission.description,
        "area": _permission_area(permission.name),
        "action": _permission_action(permission.name),
    }


def _user_to_dict(user: User, role_name: str | None = None) -> dict:
    return {
        "id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role_id": str(user.role_id),
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
        expanded.add(permission.replace(".", ":"))

    return sorted(expanded)


async def _role_to_dict(session: AsyncSession, role: Role) -> dict:
    return {
        "id": str(role.id),
        "tenant_id": str(role.tenant_id),
        "name": role.name,
        "description": role.description,
        "permissions": await _role_permissions(session, role.id),
    }


async def _get_role_or_404(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> Role:
    result = await session.execute(
        select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
    )
    role = result.scalars().first()

    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    return role


async def _ensure_unique_role_name(
    session: AsyncSession,
    tenant_id: UUID,
    name: str,
    current_role_id: UUID | None = None,
) -> None:
    stmt = select(Role).where(Role.tenant_id == tenant_id, Role.name == name)

    if current_role_id is not None:
        stmt = stmt.where(Role.id != current_role_id)

    result = await session.execute(stmt)

    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role already exists")


async def _resolve_permissions(session: AsyncSession, requested_permissions: list[str]) -> list[Permission]:
    clean_requested = sorted({item.strip() for item in requested_permissions if item and item.strip()})

    if not clean_requested:
        return []

    variants: set[str] = set()

    for permission in clean_requested:
        variants.update(_permission_variants(permission))

    result = await session.execute(
        select(Permission).where(Permission.name.in_(sorted(variants))).order_by(Permission.name)
    )
    found = list(result.scalars().all())
    found_names = {permission.name for permission in found}

    missing = [
        permission
        for permission in clean_requested
        if not (_permission_variants(permission) & found_names)
    ]

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permissions: {', '.join(missing)}",
        )

    # Se existirem aliases com ponto e dois-pontos no banco, grava todos encontrados.
    return found


async def _set_role_permissions(
    session: AsyncSession,
    role_id: UUID,
    permission_names: list[str],
) -> None:
    permissions = await _resolve_permissions(session, permission_names)

    await session.execute(
        delete(role_permissions).where(role_permissions.c.role_id == role_id)
    )

    if permissions:
        await session.execute(
            role_permissions.insert(),
            [
                {
                    "role_id": role_id,
                    "permission_id": permission.id,
                }
                for permission in permissions
            ],
        )


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

    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return _user_to_dict(user, role_name)


@router.get("/permissions")
async def list_permissions(
    current_user: CurrentUser = Depends(require_permissions(["settings.read"])),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(select(Permission).order_by(Permission.name))
    permissions = list(result.scalars().all())

    items = [_permission_to_dict(permission) for permission in permissions]

    return {"items": items, "total": len(items)}


@router.get("/roles")
async def list_roles(
    current_user: CurrentUser = Depends(require_permissions(["settings.read"])),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(Role).where(Role.tenant_id == UUID(current_user.tenant_id)).order_by(Role.name)
    )
    roles = result.scalars().all()

    items = [await _role_to_dict(session, role) for role in roles]

    return {"items": items, "total": len(items)}


@router.post("/roles", status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreateRequest,
    current_user: CurrentUser = Depends(require_permissions(["users.manage"])),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(current_user.tenant_id)
    name = payload.name.strip()

    await _ensure_unique_role_name(session, tenant_id, name)

    role = Role(
        tenant_id=tenant_id,
        name=name,
        description=payload.description,
    )

    session.add(role)
    await session.flush()

    await _set_role_permissions(session, role.id, payload.permissions)

    await session.commit()
    await session.refresh(role)

    return await _role_to_dict(session, role)


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: UUID,
    payload: RoleUpdateRequest,
    current_user: CurrentUser = Depends(require_permissions(["users.manage"])),
    session: AsyncSession = Depends(get_db_session),
):
    tenant_id = UUID(current_user.tenant_id)
    role = await _get_role_or_404(session, tenant_id, role_id)

    if payload.name is not None:
        name = payload.name.strip()
        await _ensure_unique_role_name(session, tenant_id, name, current_role_id=role.id)
        role.name = name

    if payload.description is not None:
        role.description = payload.description

    session.add(role)

    if payload.permissions is not None:
        await _set_role_permissions(session, role.id, payload.permissions)

    await session.commit()
    await session.refresh(role)

    return await _role_to_dict(session, role)


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

    items = [
        {
            "id": str(tenant.id),
            "name": tenant.name,
            "active": tenant.active,
            "created_at": tenant.created_at,
        }
        for tenant in tenants
    ]

    return {"items": items, "total": len(items)}
