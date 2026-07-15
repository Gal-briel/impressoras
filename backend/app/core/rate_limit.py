import hashlib
import logging

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.redis import redis_client

logger = logging.getLogger(__name__)


def get_rate_limit_client_ip(request: Request) -> str:
    """Obtém o IP real considerando proxy/ngrok/cloudflare."""
    for header in ("cf-connecting-ip", "x-real-ip", "x-forwarded-for"):
        value = request.headers.get(header)

        if not value:
            continue

        ip = value.split(",", 1)[0].strip()

        if ip:
            return ip

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def _hash_identifier(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


async def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Rate limit simples via Redis.

    Falha aberta se Redis estiver indisponível, para não derrubar login/enrollment.
    """
    if limit <= 0 or window_seconds <= 0:
        return

    if not redis_client.client:
        logger.warning("Rate limit ignorado para %s: Redis indisponível.", scope)
        return

    client_ip = get_rate_limit_client_ip(request)
    key = f"rate_limit:{scope}:{_hash_identifier(client_ip)}"

    try:
        current = await redis_client.client.incr(key)

        if current == 1:
            await redis_client.client.expire(key, window_seconds)

        ttl = await redis_client.client.ttl(key)

        if current > limit:
            retry_after = max(int(ttl or window_seconds), 1)

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Try again later.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(retry_after),
                },
            )

    except HTTPException:
        raise
    except RedisError as exc:
        logger.warning("Rate limit ignorado para %s: Redis falhou: %s", scope, exc)
        return
    except Exception as exc:
        logger.warning("Rate limit ignorado para %s: erro inesperado: %s", scope, exc)
        return
