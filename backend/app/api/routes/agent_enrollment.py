from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session
from app.core.dependencies import CurrentUser, require_permissions
from app.core.rate_limit import enforce_rate_limit
from app.core.security import generate_api_key, get_api_key_hash
from app.services.audit_service import get_request_ip, log_audit_event


router = APIRouter(tags=["agent-enrollment"])


class CreateEnrollmentTokenRequest(BaseModel):
    name: str | None = None
    expires_in_hours: int = 24
    max_uses: int = 1


class CreateEnrollmentTokenResponse(BaseModel):
    id: str
    token: str
    name: str | None
    expires_at: datetime
    max_uses: int


class AgentEnrollRequest(BaseModel):
    enrollment_token: str
    hostname: str
    mac_address: str
    os_version: str = "unknown"
    agent_version: str = "unknown"
    internal_ip: str | None = None
    domain_name: str | None = None
    domain: str | None = None
    capabilities: list[str] | None = None


class AgentEnrollResponse(BaseModel):
    agent_id: str
    api_key: str
    enrollment_status: str


def _normalize_domain(value: str | None) -> str | None:
    cleaned = str(value or "").strip().strip(".").lower()
    if not cleaned:
        return None
    return cleaned[:255]


def _normalize_mac(mac_address: str) -> str:
    raw = re.sub(r"[^0-9A-Fa-f]", "", mac_address or "").lower()

    if len(raw) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mac_address",
        )

    raw = raw[:12]
    return ":".join(raw[i : i + 2] for i in range(0, 12, 2))


def _clean_text(value: str | None, default: str, max_len: int) -> str:
    cleaned = (value or default).strip()

    if not cleaned:
        cleaned = default

    return cleaned[:max_len]


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


@router.post(
    "/agent-enrollment-tokens",
    response_model=CreateEnrollmentTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_agent_enrollment_token(
    payload: CreateEnrollmentTokenRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(require_permissions(["agents:write"])),
):
    expires_in_hours = max(1, min(int(payload.expires_in_hours or 24), 720))
    max_uses = max(1, min(int(payload.max_uses or 1), 10000))

    token_id = uuid4()
    plain_token = f"pbe_enroll_{secrets.token_urlsafe(32)}"
    token_hash = get_api_key_hash(plain_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    name = _clean_text(payload.name, "Enrollment token", 120)

    await session.execute(
        text(
            """
            INSERT INTO agent_enrollment_tokens (
                id,
                tenant_id,
                token_hash,
                name,
                expires_at,
                max_uses,
                used_count,
                created_by,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :tenant_id,
                :token_hash,
                :name,
                :expires_at,
                :max_uses,
                0,
                :created_by,
                now(),
                now()
            );
            """
        ),
        {
            "id": str(token_id),
            "tenant_id": str(current_user.tenant_id),
            "token_hash": token_hash,
            "name": name,
            "expires_at": expires_at,
            "max_uses": max_uses,
            "created_by": str(current_user.id),
        },
    )
    await session.commit()

    await log_audit_event(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        action="agent_enrollment_token_created",
        target_type="agent_enrollment_token",
        target_id=str(token_id),
        ip_address=get_request_ip(request),
        metadata_payload={
            "name": name,
            "expires_at": expires_at.isoformat(),
            "max_uses": max_uses,
        },
    )

    return {
        "id": str(token_id),
        "token": plain_token,
        "name": name,
        "expires_at": expires_at,
        "max_uses": max_uses,
    }


@router.post(
    "/agent/enroll",
    response_model=AgentEnrollResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_agent(
    payload: AgentEnrollRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    await enforce_rate_limit(
        request,
        scope="agent:enroll",
        limit=settings.RATE_LIMIT_ENROLLMENT_MAX_ATTEMPTS,
        window_seconds=settings.RATE_LIMIT_ENROLLMENT_WINDOW_SECONDS,
    )

    token = (payload.enrollment_token or "").strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing enrollment token",
        )

    token_hash = get_api_key_hash(token)
    now = datetime.now(timezone.utc)

    hostname = _clean_text(payload.hostname, "unknown-host", 255)
    mac_address = _normalize_mac(payload.mac_address)
    os_version = _clean_text(payload.os_version, "unknown", 100)
    agent_version = _clean_text(payload.agent_version, "unknown", 50)
    internal_ip = _clean_text(payload.internal_ip, "", 45) or None
    domain_name = _normalize_domain(payload.domain_name or payload.domain)

    new_api_key = generate_api_key()
    new_api_key_hash = get_api_key_hash(new_api_key)

    try:
        token_result = await session.execute(
            text(
                """
                SELECT
                    id,
                    tenant_id,
                    expires_at,
                    max_uses,
                    used_count,
                    revoked_at,
                    created_by
                FROM agent_enrollment_tokens
                WHERE token_hash = :token_hash
                FOR UPDATE;
                """
            ),
            {"token_hash": token_hash},
        )
        token_row = token_result.mappings().first()

        if not token_row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid enrollment token",
            )

        if token_row["revoked_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Enrollment token revoked",
            )

        expires_at = _ensure_utc(token_row["expires_at"])
        if expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Enrollment token expired",
            )

        if int(token_row["used_count"] or 0) >= int(token_row["max_uses"] or 1):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Enrollment token usage limit reached",
            )

        tenant_id = str(token_row["tenant_id"])

        agent_result = await session.execute(
            text(
                """
                SELECT id, revoked_at
                FROM agents
                WHERE tenant_id = :tenant_id
                  AND lower(mac_address) = :mac_address
                ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                LIMIT 1
                FOR UPDATE;
                """
            ),
            {
                "tenant_id": tenant_id,
                "mac_address": mac_address,
            },
        )
        agent_row = agent_result.mappings().first()

        if agent_row and agent_row["revoked_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Agent is revoked",
            )

        if agent_row:
            agent_id = str(agent_row["id"])

            await session.execute(
                text(
                    """
                    UPDATE agents
                    SET
                        hostname = :hostname,
                        os_version = :os_version,
                        agent_version = :agent_version,
                        last_ip = :last_ip,
                        domain_name = :domain_name,
                        api_key_hash = :api_key_hash,
                        enrollment_status = 'approved',
                        last_seen = now(),
                        updated_at = now()
                    WHERE id = :agent_id
                      AND tenant_id = :tenant_id;
                    """
                ),
                {
                    "agent_id": agent_id,
                    "tenant_id": tenant_id,
                    "hostname": hostname,
                    "os_version": os_version,
                    "agent_version": agent_version,
                    "last_ip": internal_ip,
                    "domain_name": domain_name,
                    "api_key_hash": new_api_key_hash,
                },
            )
        else:
            agent_id = str(uuid4())

            await session.execute(
                text(
                    """
                    INSERT INTO agents (
                        id,
                        tenant_id,
                        hostname,
                        mac_address,
                        os_version,
                        agent_version,
                        last_ip,
                        domain_name,
                        enrollment_status,
                        api_key_hash,
                        capabilities,
                        grouping_source,
                        grouping_status,
                        last_seen,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :agent_id,
                        :tenant_id,
                        :hostname,
                        :mac_address,
                        :os_version,
                        :agent_version,
                        :last_ip,
                        :domain_name,
                        'approved',
                        :api_key_hash,
                        ARRAY[]::varchar[],
                        'enrollment_token',
                        'unassigned',
                        now(),
                        now(),
                        now()
                    );
                    """
                ),
                {
                    "agent_id": agent_id,
                    "tenant_id": tenant_id,
                    "hostname": hostname,
                    "mac_address": mac_address,
                    "os_version": os_version,
                    "agent_version": agent_version,
                    "last_ip": internal_ip,
                    "domain_name": domain_name,
                    "api_key_hash": new_api_key_hash,
                },
            )

        await session.execute(
            text(
                """
                UPDATE agent_enrollment_tokens
                SET used_count = used_count + 1,
                    updated_at = now()
                WHERE id = :token_id;
                """
            ),
            {"token_id": str(token_row["id"])},
        )

        await session.commit()

    except HTTPException:
        await session.rollback()
        raise

    except Exception:
        await session.rollback()
        raise

    created_by = token_row.get("created_by")

    if created_by:
        await log_audit_event(
            tenant_id=tenant_id,
            user_id=str(created_by),
            action="agent_enrolled",
            target_type="agent",
            target_id=agent_id,
            ip_address=get_request_ip(request),
            metadata_payload={
                "hostname": hostname,
                "mac_address": mac_address,
                "domain_name": domain_name,
                "token_id": str(token_row["id"]),
            },
        )

    return {
        "agent_id": agent_id,
        "api_key": new_api_key,
        "enrollment_status": "approved",
    }
