# agent/watchdog/manager.py
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Optional

from agent.core.config import config
from agent.health.events import report_or_queue_agent_event


@dataclass
class WatchdogState:
    last_pulse_at: float
    last_pulse_source: str = "startup"
    restart_requested_at: Optional[float] = None


class WatchdogManager:
    def __init__(
        self,
        service_name: str,
        timeout_seconds: Optional[int] = None,
        check_interval_seconds: Optional[int] = None,
        restart_cooldown_seconds: Optional[int] = None,
    ):
        self.service_name = service_name
        self.timeout_seconds = timeout_seconds or config.watchdog_timeout_seconds
        self.check_interval_seconds = check_interval_seconds or config.watchdog_check_interval_seconds
        self.restart_cooldown_seconds = restart_cooldown_seconds or config.watchdog_restart_cooldown_seconds
        self.state = WatchdogState(last_pulse_at=time.monotonic())
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if not config.watchdog_enabled:
            return
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._monitor_loop, name="SaaSAgentWatchdog", daemon=True)
        self._thread.start()
        report_or_queue_agent_event(
            "agent_watchdog_started",
            f"Agent watchdog started. Timeout={self.timeout_seconds}s, check_interval={self.check_interval_seconds}s.",
            "info",
        )

    def stop(self) -> None:
        self._stop_event.set()

    def touch(self, source: str = "main_loop") -> None:
        with self._lock:
            self.state.last_pulse_at = time.monotonic()
            self.state.last_pulse_source = source

    def _monitor_loop(self) -> None:
        while not self._stop_event.wait(self.check_interval_seconds):
            elapsed, source = self._get_elapsed_since_last_pulse()
            if elapsed <= self.timeout_seconds:
                continue
            if not self._can_request_restart():
                continue
            self._request_restart(int(elapsed), source)

    def _get_elapsed_since_last_pulse(self) -> tuple[float, str]:
        with self._lock:
            return time.monotonic() - self.state.last_pulse_at, self.state.last_pulse_source

    def _can_request_restart(self) -> bool:
        now = time.monotonic()
        with self._lock:
            if self.state.restart_requested_at is not None:
                if now - self.state.restart_requested_at < self.restart_cooldown_seconds:
                    return False
            self.state.restart_requested_at = now
            return True

    def _request_restart(self, elapsed_seconds: int, source: str) -> None:
        report_or_queue_agent_event(
            "agent_watchdog_hang_detected",
            (
                "Agent watchdog detected a hang. "
                f"No health pulse for {elapsed_seconds}s. Last source={source}. "
                "The process will be terminated so Windows Service can restart it."
            ),
            "critical",
        )
        time.sleep(2)
        os._exit(2)

    @staticmethod
    def configure_windows_recovery(service_name: str) -> None:
        commands = [
            ["sc.exe", "failure", service_name, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/300000"],
            ["sc.exe", "failureflag", service_name, "1"],
        ]
        for command in commands:
            try:
                subprocess.run(command, check=False, capture_output=True, text=True)
            except Exception:
                pass
