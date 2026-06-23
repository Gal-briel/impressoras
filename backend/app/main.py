# backend/app/main.py
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agent_groups, agent_tags, agents, commands, websockets
from app.core.config import settings
from app.core.middleware import AuditMiddleware
from app.core.redis import redis_client
from app.websocket.manager import websocket_manager
from app.workers.rabbitmq import rabbitmq_client
from app.workers.timeout_monitor import monitor_command_timeouts


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_client.connect()
    await rabbitmq_client.connect()

    tasks = [
        asyncio.create_task(websocket_manager.pubsub_listen("commands_channel")),
        asyncio.create_task(websocket_manager.dashboard_listen()),
        asyncio.create_task(monitor_command_timeouts(interval_seconds=10)),
    ]

    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await redis_client.close()
        if rabbitmq_client.connection:
            await rabbitmq_client.connection.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(AuditMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(commands.router, prefix=settings.API_V1_STR)
app.include_router(agents.router, prefix=settings.API_V1_STR)
app.include_router(agent_tags.router, prefix=settings.API_V1_STR)
app.include_router(agent_groups.router, prefix=settings.API_V1_STR)
app.include_router(websockets.router, prefix=settings.API_V1_STR)
