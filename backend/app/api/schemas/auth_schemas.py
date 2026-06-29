from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RoleOut(BaseModel):
    id: UUID
    name: str
    permissions: List[str]


class TenantOut(BaseModel):
    id: UUID
    name: str
    active: bool = True


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    tenant_id: UUID
    status: str
    role: RoleOut
    tenant: Optional[TenantOut] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    tenant_id: Optional[UUID] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginResponse(TokenResponse):
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str
