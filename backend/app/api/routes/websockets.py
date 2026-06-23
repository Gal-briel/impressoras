# backend/app/api/routes/websockets.py
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from app.core.config import settings
from app.core.dependencies import get_agent_service, get_command_service
from app.core.security import verify_api_key
from app.infrastructure.database.enums import CommandStatus
from app.services.agent_service import AgentService
from app.services.command_service import CommandService
from app.websocket.manager import websocket_manager

router = APIRouter(tags=["websockets"])


@router.websocket("/dashboard/ws")
async def dashboard_websocket_endpoint(websocket: WebSocket, token: str | None = None):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        tenant_id = payload.get("tenant_id")
        user_id = payload.get("sub")
        if not tenant_id or not user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    session_id = f"{user_id}:{uuid4()}"
    await websocket_manager.connect_dashboard(session_id=session_id, tenant_id=tenant_id, websocket=websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_manager.disconnect_dashboard(session_id=session_id)


@router.websocket("/agents/{agent_id}/ws")
async def agent_websocket_endpoint(
    websocket: WebSocket,
    agent_id: str,
    command_service: CommandService = Depends(get_command_service),
    agent_service: AgentService = Depends(get_agent_service),
):
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    agent = await agent_service.repository.get(agent_uuid)
    if not agent or agent_service.is_revoked(agent):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    authorization = websocket.headers.get("authorization", "")
    header_agent_id = websocket.headers.get("x-agent-id", "")
    if header_agent_id and header_agent_id != agent_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not authorization.startswith("ApiKey "):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    plain_api_key = authorization.split(" ", 1)[1]
    if not agent.api_key_hash:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not verify_api_key(plain_api_key, agent.api_key_hash):
        if plain_api_key == agent.api_key_hash:
            await agent_service.upgrade_api_key_hash(agent_uuid, plain_api_key)
        else:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await websocket_manager.connect(agent_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "heartbeat":
                await agent_service.register_heartbeat(agent_uuid)

            elif msg_type == "command.ack":
                await command_service.update_status_idempotent(
                    command_id=UUID(data.get("command_id")),
                    new_status=CommandStatus.ACKNOWLEDGED,
                )

            elif msg_type == "command.started":
                await command_service.update_status_idempotent(
                    command_id=UUID(data.get("command_id")),
                    new_status=CommandStatus.EXECUTING,
                )

            elif msg_type == "command.finished":
                await command_service.handle_command_completion(
                    command_id=UUID(data.get("command_id")),
                    payload_status=data.get("status"),
                    output=data.get("output"),
                    error_code=data.get("error_code"),
                )

    except WebSocketDisconnect:
        websocket_manager.disconnect(agent_id)
