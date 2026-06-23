# agent/service.py
import asyncio
import sys

import httpx
import servicemanager
import win32event
import win32service
import win32serviceutil

from agent.communication.transport import TransportManager
from agent.core.config import config
from agent.health.heartbeat import HeartbeatManager
from agent.security.auth import SecurityManager
from agent.updater.manager import UpdateManager
from agent.watchdog.manager import WatchdogManager


class AgentWindowsService(win32serviceutil.ServiceFramework):
    _svc_name_ = "SaaSAgent"
    _svc_display_name_ = "SaaS Remote Management Agent"
    _svc_description_ = "Handles remote printer management and command execution."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.transport = TransportManager()
        self.heartbeat = HeartbeatManager(self.transport)
        self.watchdog = WatchdogManager(service_name=self._svc_name_)

    def _report_event(self, event_type: str, message: str, severity: str = "info"):
        try:
            with httpx.Client() as client:
                client.post(
                    f"{config.api_url}/agents/events",
                    json={"event_type": event_type, "message": message, "severity": severity},
                    headers=SecurityManager.get_auth_headers(),
                    timeout=5.0,
                )
        except Exception:
            pass

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self.watchdog.stop()
        self._report_event("agent_stopped", "Windows service is stopping.", "warning")
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        WatchdogManager.configure_windows_recovery(self._svc_name_)
        self._report_event("agent_started", f"Windows service started (v{config.version}).", "info")
        asyncio.run(self.main_loop())

    async def _watchdog_pulse_loop(self):
        while True:
            self.watchdog.touch("asyncio_main_loop")
            await asyncio.sleep(config.watchdog_pulse_interval_seconds)

    async def main_loop(self):
        self.watchdog.start()
        self.watchdog.touch("service_main_loop_started")

        transport_task = asyncio.create_task(self.transport.start())
        heartbeat_task = asyncio.create_task(self.heartbeat.start())
        updater_task = asyncio.create_task(UpdateManager.check_for_updates())
        watchdog_pulse_task = asyncio.create_task(self._watchdog_pulse_loop())

        try:
            await asyncio.gather(transport_task, heartbeat_task, updater_task, watchdog_pulse_task)
        except Exception as exc:
            self._report_event("agent_runtime_error", f"Agent main loop crashed: {str(exc)}", "error")
            raise
        finally:
            self.watchdog.stop()


if __name__ == "__main__":
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(AgentWindowsService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(AgentWindowsService)
