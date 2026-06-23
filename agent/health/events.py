# agent/health/events.py
from typing import Literal

import httpx

from agent.core.config import config
from agent.security.auth import SecurityManager

Severity = Literal["info", "warning", "error", "critical"]


def report_agent_event_sync(event_type: str, message: str, severity: Severity = "info") -> bool:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{config.api_url}/agents/events",
                json={"event_type": event_type, "message": message, "severity": severity},
                headers=SecurityManager.get_auth_headers(),
            )
        return 200 <= response.status_code < 300
    except Exception:
        return False


def queue_agent_event(event_type: str, message: str, severity: Severity = "info") -> None:
    try:
        from agent.storage.local_queue import local_queue

        local_queue.push(
            "agent_event",
            {"event_type": event_type, "message": message, "severity": severity},
        )
    except Exception:
        pass


def report_or_queue_agent_event(event_type: str, message: str, severity: Severity = "info") -> None:
    if not report_agent_event_sync(event_type=event_type, message=message, severity=severity):
        queue_agent_event(event_type=event_type, message=message, severity=severity)
