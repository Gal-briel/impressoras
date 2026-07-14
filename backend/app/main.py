import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.api.routes import persisted_inventory
from app.api.routes import security_alerts
from app.api.routes import software_inventory_changes
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    agent_runtime as agent_runtime_routes,
    agent_events,
    agent_groups,
    agent_inventory,
    agent_tags,
    agents,
    auth,
    commands,
    printers,
    settings as settings_routes,
    websockets,
)
from app.core.config import settings, validate_runtime_security
from app.core.middleware import AuditMiddleware
from app.core.openapi import configure_openapi
from app.core.redis import redis_client
from app.websocket.manager import websocket_manager
from app.workers.rabbitmq import rabbitmq_client
from app.workers.timeout_monitor import monitor_command_timeouts
from app.api.routes import dashboard
from app.api.routes import operational_alerts
from app.api.routes import notifications
from app.api.routes import reports
from app.api.routes import audit
from app.api.routes import agent_health as agent_health_routes

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


validate_runtime_security()

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
app.include_router(agent_runtime_routes.router, prefix=settings.API_V1_STR)
app.include_router(agents.router, prefix=settings.API_V1_STR)
app.include_router(commands.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(printers.router, prefix=settings.API_V1_STR)
app.include_router(settings_routes.router, prefix=settings.API_V1_STR)
app.include_router(agent_tags.router, prefix=settings.API_V1_STR)
app.include_router(agent_groups.router, prefix=settings.API_V1_STR)
app.include_router(agent_inventory.router, prefix=settings.API_V1_STR)
app.include_router(agent_health_routes.router, prefix=settings.API_V1_STR)
app.include_router(websockets.router, prefix=settings.API_V1_STR)

# Rotas usadas diretamente pelo agente Windows 0.1.x
app.include_router(agent_events.router, prefix=settings.API_V1_STR)

app.include_router(persisted_inventory.router, prefix="/api/v1")
app.include_router(security_alerts.router, prefix="/api/v1")
app.include_router(software_inventory_changes.router, prefix="/api/v1")
app.include_router(operational_alerts.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")

configure_openapi(app)


# --- AGENT_PACKAGE_ROUTES_START ---
from pathlib import Path as _AgentPackagePath

from fastapi import HTTPException as _AgentPackageHTTPException
from fastapi.responses import FileResponse as _AgentPackageFileResponse


_AGENT_PACKAGE_DIST = _AgentPackagePath(__file__).resolve().parents[2] / "agent" / "windows" / "dist"


@app.get("/agent-packages/{filename}", include_in_schema=False)
async def _download_agent_package(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise _AgentPackageHTTPException(status_code=400, detail="Invalid package filename")

    package_path = _AGENT_PACKAGE_DIST / filename

    if not package_path.is_file():
        raise _AgentPackageHTTPException(status_code=404, detail="Agent package not found")

    return _AgentPackageFileResponse(
        path=package_path,
        filename=filename,
        media_type="application/zip",
    )
# --- AGENT_PACKAGE_ROUTES_END ---


# --- FRONTEND_STATIC_SERVING_START ---
from pathlib import Path as _FrontendPath

from fastapi import HTTPException as _FrontendHTTPException
from fastapi.responses import FileResponse as _FrontendFileResponse
from fastapi.staticfiles import StaticFiles as _FrontendStaticFiles


_FRONTEND_DIST = _FrontendPath(__file__).resolve().parents[2] / "frontend" / "dist"

_AGENT_DIST = _FrontendPath(__file__).resolve().parents[2] / "agent" / "windows" / "dist"

if _AGENT_DIST.exists():
    app.mount(
        "/agent-packages",
        _FrontendStaticFiles(directory=str(_AGENT_DIST)),
        name="agent-packages",
    )


if _FRONTEND_DIST.exists():
    _FRONTEND_ASSETS = _FRONTEND_DIST / "assets"

    if _FRONTEND_ASSETS.exists():
        app.mount(
            "/assets",
            _FrontendStaticFiles(directory=str(_FRONTEND_ASSETS)),
            name="frontend-assets",
        )

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def _serve_frontend_index():
        return _FrontendFileResponse(_FRONTEND_DIST / "index.html")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def _serve_frontend_spa(full_path: str):
        if (
            full_path.startswith("api/")
            or full_path == "docs"
            or full_path.startswith("docs/")
            or full_path == "redoc"
            or full_path == "openapi.json"
        ):
            raise _FrontendHTTPException(status_code=404)

        requested_file = _FRONTEND_DIST / full_path

        if requested_file.is_file():
            return _FrontendFileResponse(requested_file)

        return _FrontendFileResponse(_FRONTEND_DIST / "index.html")
# --- FRONTEND_STATIC_SERVING_END ---



# SPRINT 26 - no-cache para HTML do SPA
# Evita que rotas como /reports carreguem um index.html antigo do navegador/proxy.
@app.middleware("http")
async def add_no_cache_headers_for_spa_html(request, call_next):
    response = await call_next(request)

    content_type = response.headers.get("content-type", "")
    path = request.url.path

    if (
        request.method == "GET"
        and not path.startswith("/api/")
        and "text/html" in content_type
    ):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response

# --- FINAL_AGENT_RUNTIME_INCLUDE ---
# Registrado ao final para garantir prioridade funcional mesmo com rotas SPA/catch-all.
app.include_router(agent_runtime_routes.router, prefix=settings.API_V1_STR)
