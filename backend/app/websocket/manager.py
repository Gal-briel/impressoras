# backend/app/websocket/manager.py
import json
from typing import Dict

from fastapi import WebSocket
import redis.asyncio as redis

from app.core.config import settings


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.dashboard_connections: Dict[str, dict] = {}
        self.redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

    async def connect(self, agent_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        await self.redis_client.hset("agent_status", agent_id, "online")

    def disconnect(self, agent_id: str):
        self.active_connections.pop(agent_id, None)

    async def close_agent_connection(self, agent_id: str, code: int = 1008, reason: str = "Agent revoked"):
        websocket = self.active_connections.get(agent_id)
        if websocket:
            try:
                await websocket.close(code=code, reason=reason)
            finally:
                self.disconnect(agent_id)

    async def send_personal_message(self, message: str, agent_id: str):
        if agent_id in self.active_connections:
            await self.active_connections[agent_id].send_text(message)

    async def pubsub_listen(self, channel: str):
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe(channel)
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                agent_id = data.get("agent_id")
                if agent_id and agent_id in self.active_connections:
                    await self.active_connections[agent_id].send_json(data)

    async def connect_dashboard(self, session_id: str, tenant_id: str, websocket: WebSocket):
        await websocket.accept()
        self.dashboard_connections[session_id] = {"ws": websocket, "tenant_id": str(tenant_id)}

    def disconnect_dashboard(self, session_id: str):
        self.dashboard_connections.pop(session_id, None)

    async def broadcast_event(self, tenant_id: str, event_type: str, data: dict):
        message = {"tenant_id": str(tenant_id), "type": event_type, "data": data}
        await self.redis_client.publish("dashboard_events", json.dumps(message, default=str))

    async def dashboard_listen(self):
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe("dashboard_events")
        async for message in pubsub.listen():
            if message["type"] == "message":
                event_data = json.loads(message["data"])
                target_tenant = event_data["tenant_id"]
                for session_id, conn_info in list(self.dashboard_connections.items()):
                    if conn_info["tenant_id"] == target_tenant:
                        try:
                            await conn_info["ws"].send_json(event_data)
                        except Exception:
                            self.disconnect_dashboard(session_id)


websocket_manager = ConnectionManager()
