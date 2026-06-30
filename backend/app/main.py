import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    agent_events,
    agent_groups,
    agent_health,
    agent_inventory,
    agent_runtime,
    agent_tags,
    agents,
    auth,
    commands,
    printers,
    websockets,
)
from app.core.config import settings
from app.core.middleware import AuditMiddleware
from app.core.openapi import configure_openapi
from app.core.redis import redis_client
from app.websocket.manager import websocket_manager
from app.workers.rabbitmq import rabbitmq_client
from app.workers.timeout_monitor import monitor_command_timeouts
from app.api.routes import dashboard

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with contextlib.suppress(Exception):
        await redis_client.connect()

    with contextlib.suppress(Exception):
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

        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

        with contextlib.suppress(Exception):
            await redis_client.close()

        if rabbitmq_client.connection:
            with contextlib.suppress(Exception):
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

# Rotas web/autenticadas
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(agents.router, prefix=settings.API_V1_STR)
app.include_router(commands.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(printers.router, prefix=settings.API_V1_STR)
app.include_router(agent_tags.router, prefix=settings.API_V1_STR)
app.include_router(agent_groups.router, prefix=settings.API_V1_STR)
app.include_router(agent_health.router, prefix=settings.API_V1_STR)
app.include_router(agent_inventory.router, prefix=settings.API_V1_STR)
app.include_router(websockets.router, prefix=settings.API_V1_STR)

# Rotas usadas diretamente pelo agente Windows 0.1.x
app.include_router(agent_runtime.router, prefix=settings.API_V1_STR)
app.include_router(agent_events.router, prefix=settings.API_V1_STR)

configure_openapi(app)
