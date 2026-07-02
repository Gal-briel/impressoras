from __future__ import annotations

import socket
import time
from typing import Any

import requests


class GabrielApiClient:
    def __init__(self, base_url: str, agent_id: str, api_key: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.api_key = api_key
        self.timeout = timeout

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"ApiKey {self.api_key}",
            "x-agent-id": self.agent_id,
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        response = requests.request(
            method=method,
            url=url,
            headers=self.headers,
            timeout=self.timeout,
            **kwargs,
        )

        response.raise_for_status()

        if response.content:
            return response.json()

        return {}

    def check_in(self, agent_version: str) -> dict[str, Any]:
        payload = {
            "agent_version": agent_version,
            "internal_ip": self._get_local_ip(),
            "uptime_seconds": int(time.monotonic()),
        }

        return self._request("POST", "/agent/check-in", json=payload)

    def report_event(self, event_type: str, message: str, severity: str = "info") -> dict[str, Any]:
        payload = {
            "event_type": event_type,
            "message": message,
            "severity": severity,
        }

        return self._request("POST", "/agent/events", json=payload)

    def get_pending_commands(self, limit: int = 5) -> list[dict[str, Any]]:
        data = self._request("GET", f"/agent/commands/pending?limit={limit}")
        return data.get("items", [])

    def update_command_status(
        self,
        command_id: str,
        status: str,
        output: str | None = None,
        error_code: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": status,
        }

        if output is not None:
            payload["output"] = output

        if error_code is not None:
            payload["error_code"] = error_code

        return self._request("POST", f"/agent/commands/{command_id}/status", json=payload)

    def send_printer_inventory(self, printers: list[dict[str, Any]]) -> dict[str, Any]:
        return self._request("POST", "/agent/printers/inventory", json={"printers": printers})

    @staticmethod
    def _get_local_ip() -> str | None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(("8.8.8.8", 80))
                return sock.getsockname()[0]
        except Exception:
            return None
