# agent/collector/system.py
import platform
import socket
import psutil
from typing import Dict, Any

class SystemCollector:
    @staticmethod
    def get_inventory() -> Dict[str, Any]:
        return {
            "hostname": socket.gethostname(),
            "os_version": platform.platform(),
            "mac_address": SystemCollector._get_mac_address(),
            "uptime_seconds": int(psutil.boot_time()),
            "cpu_usage": psutil.cpu_percent(),
            "memory_total": psutil.virtual_memory().total,
            "memory_used": psutil.virtual_memory().used
        }

    @staticmethod
    def _get_mac_address() -> str:
        for interface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == psutil.AF_LINK:
                    return addr.address
        return "00:00:00:00:00:00"