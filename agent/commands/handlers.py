# agent/commands/handlers.py
import subprocess
from typing import Dict, Any, Callable
from agent.collector.printers import PrinterCollector
from agent.collector.system import SystemCollector

class CommandExecutor:
    def __init__(self):
        self.handlers: Dict[str, Callable] = {
            "restart_spooler": self._restart_spooler,
            "clear_print_queue": self._clear_print_queue,
            "collect_inventory": self._collect_inventory,
            "list_printers": self._list_printers
        }

    def execute(self, command_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        handler = self.handlers.get(command_type)
        if not handler:
            return {"status": "FAILED", "error_code": "UNKNOWN_COMMAND"}
        try:
            return handler(payload)
        except Exception as e:
            return {"status": "FAILED", "error_code": "EXECUTION_ERROR", "output": str(e)}

    def _restart_spooler(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        subprocess.run(["net", "stop", "spooler"], check=True, capture_output=True)
        subprocess.run(["net", "start", "spooler"], check=True, capture_output=True)
        return {"status": "SUCCESS", "output": "Spooler restarted successfully."}

    def _clear_print_queue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        subprocess.run(["net", "stop", "spooler"], check=True, capture_output=True)
        subprocess.run(["del", "/Q", "/F", "/S", r"%systemroot%\System32\Spool\Printers\*.*"], shell=True, check=True)
        subprocess.run(["net", "start", "spooler"], check=True, capture_output=True)
        return {"status": "SUCCESS", "output": "Print queue cleared."}

    def _collect_inventory(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "SUCCESS", "output": SystemCollector.get_inventory()}

    def _list_printers(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "SUCCESS", "output": PrinterCollector.get_printers()}

command_executor = CommandExecutor()