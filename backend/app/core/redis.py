# backend/app/core/redis.py
import logging

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    def __init__(self):
        self.client = None

    async def connect(self):
        self.client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )

    async def close(self):
        if self.client:
            await self.client.aclose()

    async def safe_exists(self, key: str) -> bool:
        if not self.client:
            return False
        try:
            return bool(await self.client.exists(key))
        except RedisError as exc:
            logger.warning("Redis unavailable while checking key %s: %s", key, exc)
            return False

    async def safe_setex(self, name: str, time: int, value: str) -> None:
        if not self.client:
            return
        try:
            await self.client.setex(name=name, time=time, value=value)
        except RedisError as exc:
            logger.warning("Redis unavailable while setting key %s: %s", name, exc)

    async def safe_delete(self, key: str) -> None:
        if not self.client:
            return
        try:
            await self.client.delete(key)
        except RedisError as exc:
            logger.warning("Redis unavailable while deleting key %s: %s", key, exc)


redis_client = RedisClient()
