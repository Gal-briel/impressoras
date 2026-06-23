# backend/app/core/redis.py

import redis.asyncio as redis
from app.core.config import settings

class RedisClient:
    def __init__(self):
        self.client = None

    async def connect(self):
        self.client = redis.from_url(
            settings.REDIS_URL, # Ex: redis://localhost:6379/0
            encoding="utf-8",
            decode_responses=True
        )

    async def close(self):
        if self.client:
            await self.client.aclose()

redis_client = RedisClient()