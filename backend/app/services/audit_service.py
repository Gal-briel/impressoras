from typing import Any
from datetime import date, datetime, time
from uuid import UUID

from fastapi import Request

from app.core.database import AsyncSessionLocal
from app.infrastructure.database.models import AuditLog


SENSITIVE_AUDIT_KEYS = {
    "password",
    "senha",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "credentials",
    "private_key",
    "new_api_key",
}


def get_request_ip(request: Request) -> str | None:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client:
        return request.client.host

    return None


def sanitize_audit_metadata(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "[truncated]"

    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if any(secret in key_text for secret in SENSITIVE_AUDIT_KEYS):
                clean[str(key)] = "[redacted]"
            else:
                clean[str(key)] = sanitize_audit_metadata(item, depth + 1)
        return clean

    if isinstance(value, list):
        return [sanitize_audit_metadata(item, depth + 1) for item in value[:50]]

    if isinstance(value, str):
        if len(value) > 500:
            return value[:500] + "...[truncated]"
        return value

    if isinstance(value, (UUID, datetime, date, time)):
        return str(value)

    try:
        import json
        json.dumps(value)
        return value
    except Exception:
        return str(value)


async def log_audit_event(
    *,
    tenant_id: UUID | str,
    user_id: UUID | str | None,
    action: str,
    target_type: str,
    target_id: UUID | str,
    metadata_payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    if not tenant_id or not user_id:
        return

    async with AsyncSessionLocal() as session:
        audit_log = AuditLog(
            tenant_id=UUID(str(tenant_id)),
            user_id=UUID(str(user_id)),
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            metadata_payload=sanitize_audit_metadata(metadata_payload or {}),
            ip_address=ip_address,
        )

        session.add(audit_log)
        await session.commit()



def log_audit_event_sync(
    *,
    tenant_id,
    user_id,
    action: str,
    target_type: str,
    target_id,
    metadata_payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    if not tenant_id or not user_id:
        return

    try:
        import psycopg2
        from psycopg2.extras import Json
        from uuid import uuid4

        from app.core.config import get_sync_database_url

        with psycopg2.connect(get_sync_database_url(), connect_timeout=10) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (
                        id,
                        tenant_id,
                        user_id,
                        action,
                        target_type,
                        target_id,
                        metadata_payload,
                        ip_address,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, now(), now()
                    );
                    """,
                    (
                        str(uuid4()),
                        str(tenant_id),
                        str(user_id),
                        action,
                        target_type,
                        str(target_id),
                        Json(sanitize_audit_metadata(metadata_payload or {})),
                        ip_address,
                    ),
                )
            conn.commit()
    except Exception as exc:
        print(f"[audit] falha ao gravar audit log sync: {exc}")
        return
