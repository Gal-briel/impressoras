from typing import Iterable, Optional
from uuid import UUID

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth_schemas import LoginResponse, RoleOut, TenantOut, TokenResponse, UserOut
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.infrastructure.database.enums import UserStatus
from app.infrastructure.database.models import Permission, Role, Tenant, User, role_permissions


def normalize_permissions(permissions: Iterable[str]) -> list[str]:
    normalized: set[str] = set()

    for permission in permissions:
        normalized.add(permission)
        normalized.add(permission.replace(":", "."))
        normalized.add(permission.replace(".", ":"))

    if "agents:read" in normalized or "agents.read" in normalized:
        normalized.update({"printers.read", "audit.read", "settings.read"})

    if "agents:write" in normalized or "agents.write" in normalized:
        normalized.update({"users.manage"})

    if "commands:execute" in normalized or "commands.execute" in normalized:
        normalized.update({"commands.execute", "commands:execute"})

    return sorted(normalized)


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_permissions(self, role_id: UUID) -> list[str]:
        result = await self.session.execute(
            select(Permission.name)
            .select_from(
                role_permissions.join(
                    Permission,
                    role_permissions.c.permission_id == Permission.id,
                )
            )
            .where(role_permissions.c.role_id == role_id)
        )

        return normalize_permissions(result.scalars().all())

    async def _serialize_user(
        self,
        user: User,
        role: Role,
        tenant: Tenant,
        permissions: list[str],
    ) -> UserOut:
        return UserOut(
            id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
            status=str(user.status.value if hasattr(user.status, "value") else user.status),
            role=RoleOut(
                id=role.id,
                name=role.name,
                permissions=permissions,
            ),
            tenant=TenantOut(
                id=tenant.id,
                name=tenant.name,
                active=tenant.active,
            ),
        )

    async def authenticate(
        self,
        email: str,
        password: str,
        tenant_id: Optional[UUID] = None,
    ) -> LoginResponse:
        stmt = (
            select(User, Role, Tenant)
            .join(Role, User.role_id == Role.id)
            .join(Tenant, User.tenant_id == Tenant.id)
            .where(User.email == email)
        )

        if tenant_id:
            stmt = stmt.where(User.tenant_id == tenant_id)

        result = await self.session.execute(stmt)
        row = result.first()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        user, role, tenant = row

        user_status = str(user.status.value if hasattr(user.status, "value") else user.status)

        if user_status != UserStatus.ACTIVE.value or not tenant.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User inactive or tenant disabled",
            )

        if not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        permissions = await self._get_permissions(role.id)

        access_token = create_access_token(
            str(user.id),
            str(user.tenant_id),
            permissions,
        )

        refresh_token = create_refresh_token(
            str(user.id),
            str(user.tenant_id),
            permissions,
        )

        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=await self._serialize_user(user, role, tenant, permissions),
        )

    async def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = jwt.decode(
                refresh_token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
            )

            if payload.get("type") != "refresh":
                raise JWTError("Invalid token type")

            user_id = payload.get("sub")
            tenant_id = payload.get("tenant_id")
            permissions = normalize_permissions(payload.get("permissions", []))

            if not user_id or not tenant_id:
                raise JWTError("Invalid token payload")

        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        access_token = create_access_token(
            str(user_id),
            str(tenant_id),
            permissions,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def me(self, user_id: UUID) -> UserOut:
        result = await self.session.execute(
            select(User, Role, Tenant)
            .join(Role, User.role_id == Role.id)
            .join(Tenant, User.tenant_id == Tenant.id)
            .where(User.id == user_id)
        )

        row = result.first()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        user, role, tenant = row
        permissions = await self._get_permissions(role.id)

        return await self._serialize_user(user, role, tenant, permissions)
