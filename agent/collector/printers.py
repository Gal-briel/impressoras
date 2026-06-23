# agent/collector/printers.py
import wmi
from typing import List, Dict, Any

class PrinterCollector:
    @staticmethod
    def get_printers() -> List[Dict[str, Any]]:
        c = wmi.WMI()
        printers = []
        for printer in c.Win32_Printer():
            printers.append({
                "name": printer.Name,
                "driver": printer.DriverName,
                "port": printer.PortName,
                "is_default": bool(printer.Default),
                "status": printer.PrinterStatus,
                "network": printer.Network,
                "shared": printer.Shared
            })
        return printers