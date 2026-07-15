from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth_schemas import LoginRequest, LoginResponse, RefreshRequest, TokenResponse, UserOut
from app.core.config import settings
from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, get_current_user
from app.core.rate_limit import enforce_rate_limit
from app.services.auth_service import AuthService

router = APIRouter(tags=["auth"])


def get_auth_service(session: AsyncSession = Depends(get_db_session)) -> AuthService:
    return AuthService(session)


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
):
    await enforce_rate_limit(
        request,
        scope="auth:login",
        limit=settings.RATE_LIMIT_LOGIN_MAX_ATTEMPTS,
        window_seconds=settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )

    return await auth_service.authenticate(
        email=payload.email,
        password=payload.password,
        tenant_id=payload.tenant_id,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
):
    await enforce_rate_limit(
        request,
        scope="auth:refresh",
        limit=settings.RATE_LIMIT_REFRESH_MAX_ATTEMPTS,
        window_seconds=settings.RATE_LIMIT_REFRESH_WINDOW_SECONDS,
    )

    return await auth_service.refresh(payload.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    return None


@router.get("/me", response_model=UserOut)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
):
    return await auth_service.me(UUID(current_user.id))
