# agent/communication/transport.py
import asyncio
import contextlib
import json
from typing import Optional, Set

import httpx
import websockets

from agent.commands.handlers import command_executor
from agent.core.config import config
from agent.security.auth import SecurityManager
from agent.storage.local_queue import local_queue


class TransportManager:
    def __init__(self):
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.http_client = httpx.AsyncClient(headers=SecurityManager.get_auth_headers())
        self.is_connected = False
        self._executed_command_ids: Set[str] = set()
        self._running_command_ids: Set[str] = set()

    async def start(self) -> None:
        await self._resume_local_commands()
        while True:
            try:
                await self._connect_ws()
            except Exception:
                self.is_connected = False
                await self._fallback_polling()
            await asyncio.sleep(5)

    async def _connect_ws(self) -> None:
        headers = SecurityManager.get_auth_headers()
        async with websockets.connect(f"{config.ws_url}/{config.agent_id}/ws", extra_headers=headers) as ws:
            self.ws = ws
            self.is_connected = True
            await self._flush_queue()
            await self._resume_local_commands()

            async for message in ws:
                await self._handle_message(json.loads(message))

    async def _handle_message(self, data: dict) -> None:
        if data.get("type") != "command.dispatch":
            return

        cmd = data["data"]
        command_id = cmd["command_id"]
        local_state = local_queue.get_pending_command(command_id)

        if local_state and local_state["status"] == "FINISHED":
            result_payload = local_state.get("result_payload")
            if result_payload:
                local_queue.push("command_result", result_payload)
                await self._flush_queue()
            return

        if command_id in self._running_command_ids:
            return

        local_queue.upsert_pending_command(command_id, cmd)
        await self._execute_persisted_command(cmd)

    async def _execute_persisted_command(self, cmd: dict) -> None:
        command_id = cmd["command_id"]
        if command_id in self._running_command_ids:
            return

        self._running_command_ids.add(command_id)
        try:
            local_queue.mark_command_started(command_id)

            await self.send({"type": "command.ack", "command_id": command_id, "status": "ACKNOWLEDGED"})
            await self.send({"type": "command.started", "command_id": command_id, "status": "EXECUTING"})

            result = await asyncio.to_thread(command_executor.execute, cmd["command_type"], cmd["payload"])

            response = {
                "type": "command.finished",
                "command_id": command_id,
                "correlation_id": cmd.get("correlation_id"),
                "status": result["status"],
                "output": json.dumps(result.get("output", "")),
                "error_code": result.get("error_code"),
            }
            local_queue.mark_command_finished(command_id, response)
            local_queue.push("command_result", response)
            await self._flush_queue()
            self._executed_command_ids.add(command_id)

        except Exception as exc:
            local_queue.mark_command_error(command_id, str(exc))
            error_response = {
                "type": "command.finished",
                "command_id": command_id,
                "correlation_id": cmd.get("correlation_id"),
                "status": "FAILED",
                "output": "",
                "error_code": "LOCAL_AGENT_EXECUTION_ERROR",
            }
            local_queue.mark_command_finished(command_id, error_response)
            local_queue.push("command_result", error_response)
            with contextlib.suppress(Exception):
                await self._flush_queue()
        finally:
            self._running_command_ids.discard(command_id)

    async def _resume_local_commands(self) -> None:
        pending_commands = local_queue.list_pending_commands()
        for item in pending_commands:
            command_id = item["command_id"]
            status = item["status"]
            if command_id in self._running_command_ids:
                continue
            if status == "FINISHED":
                result_payload = item.get("result_payload")
                if result_payload:
                    local_queue.push("command_result", result_payload)
                continue
            await self._execute_persisted_command(item["payload"])
        await self._flush_queue()

    async def send(self, payload: dict) -> None:
        try:
            await self._send_online(payload)
        except Exception:
            self.is_connected = False
            local_queue.push("ws_message", payload)

    async def _send_online(self, payload: dict) -> None:
        if not self.is_connected or not self.ws:
            raise ConnectionError("WebSocket is not connected")
        await self.ws.send(json.dumps(payload))

    async def _post_agent_event(self, payload: dict) -> None:
        response = await self.http_client.post(
            f"{config.api_url}/agents/events",
            json={
                "event_type": payload["event_type"],
                "message": payload["message"],
                "severity": payload.get("severity", "info"),
            },
        )
        response.raise_for_status()

    async def _flush_queue(self) -> None:
        messages = local_queue.peek_batch(limit=50)
        for msg in messages:
            try:
                if msg["topic"] == "agent_event":
                    await self._post_agent_event(msg["payload"])
                    local_queue.ack_message(msg["id"])
                    continue

                if not self.is_connected or not self.ws:
                    return

                await self._send_online(msg["payload"])
                local_queue.ack_message(msg["id"])

                payload = msg["payload"]
                if (
                    msg["topic"] == "command_result"
                    and payload.get("type") == "command.finished"
                    and payload.get("command_id")
                ):
                    local_queue.complete_command(payload["command_id"])

            except Exception as exc:
                self.is_connected = False
                local_queue.mark_message_error(msg["id"], str(exc))
                break

    async def _fallback_polling(self) -> None:
        try:
            response = await self.http_client.post(
                f"{config.api_url}/agents/check-in",
                json={"agent_version": config.version, "uptime_seconds": 0},
            )
            if response.status_code == 200:
                await self._resume_local_commands()
        except httpx.RequestError:
            pass
