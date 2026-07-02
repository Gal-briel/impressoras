from __future__ import annotations

import json
import platform
import subprocess
from typing import Any


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def run_powershell(script: str, timeout: int = 60) -> str:
    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())

    return completed.stdout.strip()


def collect_printers() -> list[dict[str, Any]]:
    if not is_windows():
        return []

    script = r"""
$defaultPrinter = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)

Get-Printer | Select-Object `
    Name, `
    DriverName, `
    PortName, `
    Shared, `
    ShareName, `
    Location, `
    Comment, `
    PrinterStatus | ForEach-Object {
        [PSCustomObject]@{
            name = $_.Name
            driver_name = $_.DriverName
            port_name = $_.PortName
            share_name = $_.ShareName
            location = $_.Location
            comment = $_.Comment
            status = [string]$_.PrinterStatus
            is_default = ($_.Name -eq $defaultPrinter)
            is_shared = [bool]$_.Shared
            is_network = ($_.PortName -like "IP_*" -or $_.PortName -like "\\\\*")
            is_online = $true
        }
    } | ConvertTo-Json -Depth 4
"""

    output = run_powershell(script)

    if not output:
        return []

    data = json.loads(output)

    if isinstance(data, dict):
        return [data]

    if isinstance(data, list):
        return data

    return []
