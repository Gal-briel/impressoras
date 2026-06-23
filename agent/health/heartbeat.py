# agent/health/heartbeat.py
import asyncio
import psutil
from agent.communication.transport import TransportManager
from agent.core.config import config

class HeartbeatManager:
    def __init__(self, transport: TransportManager):
        self.transport = transport

    async def start(self) -> None:
        while True:
            await asyncio.sleep(30)
            payload = {
                "type": "heartbeat",
                "agent_id": config.agent_id,
                "uptime": int(psutil.boot_time())
            }
            await self.transport.send(payload)