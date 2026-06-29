from __future__ import annotations

import socket
import os
import json

from pathlib import Path
from datetime import datetime
import zipfile
import tempfile
import shutil
import hashlib

import platform
import subprocess
from dataclasses import dataclass
from typing import Any

from printer_inventory import collect_printers


@dataclass
class CommandResult:
    success: bool
    output: str
    error_code: str | None = None
    printers: list[dict[str, Any]] | None = None


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def run_powershell(script: str, timeout: int = 120) -> str:
    if not is_windows():
        raise RuntimeError("Este comando precisa ser executado em Windows.")

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


def get_printer_name(payload: dict[str, Any]) -> str:
    printer_name = payload.get("printer_name") or payload.get("name")

    if not printer_name:
        raise ValueError("printer_name ausente no payload do comando.")

    return str(printer_name).replace('"', '\\"')




def update_agent(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}

    package_url = payload.get("package_url")
    expected_sha256 = payload.get("sha256")
    new_version = payload.get("version")
    task_name = payload.get("task_name") or "Gabriel Windows Agent"

    if not package_url:
        return {
            "status": "error",
            "message": "Payload obrigatório: package_url",
        }

    install_dir = Path(__file__).resolve().parent
    logs_dir = install_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    updater_script = logs_dir / f"update_agent_{timestamp}.ps1"
    updater_log = logs_dir / "agent_update.log"

    package_url_ps = str(package_url).replace("'", "''")
    expected_sha256_ps = str(expected_sha256 or "").replace("'", "''")
    new_version_ps = str(new_version or "").replace("'", "''")
    task_name_ps = str(task_name).replace("'", "''")
    install_dir_ps = str(install_dir).replace("'", "''")
    updater_log_ps = str(updater_log).replace("'", "''")

    script = f"""
$ErrorActionPreference = "Stop"

$InstallDir = '{install_dir_ps}'
$PackageUrl = '{package_url_ps}'
$ExpectedSha256 = '{expected_sha256_ps}'
$NewVersion = '{new_version_ps}'
$TaskName = '{task_name_ps}'
$LogPath = '{updater_log_ps}'

function Write-UpdateLog {{
    param([string]$Message)
    $line = "[{{0}}] {{1}}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogPath -Value $line
}}

try {{
    Write-UpdateLog "Atualização iniciada."
    Write-UpdateLog "URL: $PackageUrl"
    Write-UpdateLog "InstallDir: $InstallDir"

    Start-Sleep -Seconds 6

    $TempRoot = Join-Path $env:TEMP ("gabriel-agent-update-" + [guid]::NewGuid().ToString())
    $ZipPath = Join-Path $TempRoot "agent.zip"
    $ExtractDir = Join-Path $TempRoot "extract"

    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null

    Write-UpdateLog "Baixando pacote..."
    Invoke-WebRequest -Uri $PackageUrl -OutFile $ZipPath -UseBasicParsing

    if ($ExpectedSha256) {{
        Write-UpdateLog "Validando SHA256..."
        $ActualSha256 = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()

        if ($ActualSha256 -ne $ExpectedSha256.ToLower()) {{
            throw "SHA256 inválido. Esperado=$ExpectedSha256 Atual=$ActualSha256"
        }}

        Write-UpdateLog "SHA256 validado."
    }}

    Write-UpdateLog "Extraindo pacote..."
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

    $CandidateRoot = $ExtractDir

    $mainCandidates = Get-ChildItem -Path $ExtractDir -Recurse -Filter "main.py" | Select-Object -First 1

    if ($mainCandidates) {{
        $CandidateRoot = Split-Path -Parent $mainCandidates.FullName
    }}

    Write-UpdateLog "Raiz do pacote: $CandidateRoot"

    $FilesToCopy = @(
        "main.py",
        "api_client.py",
        "command_runner.py",
        "requirements.txt",
        "install_agent.ps1",
        "uninstall_agent.ps1",
        "package_agent.ps1",
        "README_INSTALL.md"
    )

    foreach ($File in $FilesToCopy) {{
        $Source = Join-Path $CandidateRoot $File
        $Destination = Join-Path $InstallDir $File

        if (Test-Path $Source) {{
            Copy-Item -Path $Source -Destination $Destination -Force
            Write-UpdateLog "Arquivo atualizado: $File"
        }}
    }}

    $PythonPath = Join-Path $InstallDir ".venv\\Scripts\\python.exe"
    $RequirementsPath = Join-Path $InstallDir "requirements.txt"

    if ((Test-Path $PythonPath) -and (Test-Path $RequirementsPath)) {{
        Write-UpdateLog "Atualizando dependências Python..."
        & $PythonPath -m pip install -r $RequirementsPath | Out-File -FilePath $LogPath -Append
    }} else {{
        Write-UpdateLog "Venv ou requirements.txt não encontrado. Dependências não atualizadas."
    }}

    if ($NewVersion) {{
        $ConfigPath = Join-Path $InstallDir "config.json"

        if (Test-Path $ConfigPath) {{
            Write-UpdateLog "Atualizando agent_version no config.json para $NewVersion"
            $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
            $Config.agent_version = $NewVersion
            $JsonText = $Config | ConvertTo-Json -Depth 10
            $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($ConfigPath, $JsonText, $Utf8NoBom)
        }}
    }}

    Write-UpdateLog "Reiniciando tarefa do agente..."

    try {{
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }} catch {{
        Write-UpdateLog "Aviso ao parar tarefa: $($_.Exception.Message)"
    }}

    try {{
        Start-ScheduledTask -TaskName $TaskName
        Write-UpdateLog "Tarefa reiniciada com sucesso."
    }} catch {{
        Write-UpdateLog "Falha ao iniciar tarefa: $($_.Exception.Message)"
        throw
    }}

    Remove-Item -Path $TempRoot -Recurse -Force -ErrorAction SilentlyContinue

    Write-UpdateLog "Atualização concluída com sucesso."
}} catch {{
    Write-UpdateLog ("ERRO: " + $_.Exception.Message)
    exit 1
}}
"""

    updater_script.write_text(script, encoding="utf-8")

    subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(updater_script),
        ],
        cwd=str(install_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP") else 0,
    )

    return {
        "status": "scheduled",
        "message": "Atualização do agente agendada em background.",
        "package_url": package_url,
        "version": new_version,
        "task_name": task_name,
        "updater_script": str(updater_script),
        "updater_log": str(updater_log),
    }





def restart_spooler():
    try:
        output = run_powershell(
            """
            Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Start-Service -Name Spooler -ErrorAction Stop
            $status = (Get-Service -Name Spooler).Status
            "Spooler reiniciado. Status: $status"
            """,
            timeout=60,
        )

        return {
            "success": True,
            "message": "Spooler reiniciado com sucesso.",
            "output": output,
        }

    except Exception as exc:
        return {
            "success": False,
            "error_code": "RESTART_SPOOLER_FAILED",
            "error": str(exc),
        }


def clear_print_queue():
    try:
        output = run_powershell(
            """
            Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2

            $spoolPath = Join-Path $env:SystemRoot "System32\\spool\\PRINTERS"

            if (Test-Path $spoolPath) {
                Get-ChildItem -Path $spoolPath -Force -ErrorAction SilentlyContinue |
                    Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
            }

            Start-Service -Name Spooler -ErrorAction Stop
            $status = (Get-Service -Name Spooler).Status

            "Fila de impressão limpa. Status do Spooler: $status"
            """,
            timeout=90,
        )

        return {
            "success": True,
            "message": "Fila de impressão limpa com sucesso.",
            "output": output,
        }

    except Exception as exc:
        return {
            "success": False,
            "error_code": "CLEAR_PRINT_QUEUE_FAILED",
            "error": str(exc),
        }




def collect_hardware_inventory() -> dict[str, Any]:
    script = r"""
$computer = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, Name, Domain, TotalPhysicalMemory
$bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber, ReleaseDate
$baseboard = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber
$cpu = Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors
$disks = Get-CimInstance Win32_DiskDrive | Select-Object Model, SerialNumber, InterfaceType, MediaType, Size
$gpus = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion
$net = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true } | Select-Object Description, MACAddress, IPAddress, DefaultIPGateway, DNSServerSearchOrder

$result = [ordered]@{
    computer = $computer
    bios = $bios
    baseboard = $baseboard
    cpu = $cpu
    disks = $disks
    gpus = $gpus
    network_adapters = $net
}

$result | ConvertTo-Json -Depth 8
"""

    try:
        output = run_powershell(script, timeout=120)

        if not output:
            return {}

        data = json.loads(output)

        if isinstance(data, dict):
            return data

        return {"raw": data}

    except Exception as exc:
        return {
            "error": str(exc),
            "warning": "Erro ao coletar hardware."
        }


def collect_diagnostics() -> CommandResult:
    try:
        printers = collect_printers()
    except Exception as exc:
        printers = []
        printer_error = str(exc)
    else:
        printer_error = None

    try:
        hardware = collect_hardware_inventory()
    except Exception as exc:
        hardware = {"error": str(exc)}

    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = None

    try:
        internal_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        internal_ip = None

    try:
        spooler_status = run_powershell("(Get-Service -Name Spooler).Status | Out-String", timeout=30)
    except Exception as exc:
        spooler_status = f"Erro ao consultar spooler: {exc}"

    output = {
        "hostname": hostname,
        "user": os.environ.get("USERNAME"),
        "domain": os.environ.get("USERDOMAIN"),
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
        },
        "network": {
            "internal_ip": internal_ip,
        },
        "spooler": {
            "status": spooler_status,
        },
        "printers": {
            "count": len(printers),
            "error": printer_error,
            "items": printers,
        },
        "hardware": hardware,
    }

    return CommandResult(
        success=True,
        output=output,
        printers=printers,
    )



def execute_command(command_type: str, payload: dict[str, Any]) -> CommandResult:
    if command_type == "collect_diagnostics":
        return collect_diagnostics()

    if command_type == "update_agent":
        return update_agent(payload or {})
    try:
        if command_type == "collect_inventory":
            printers = collect_printers()
            return CommandResult(
                success=True,
                output=f"Inventário coletado. Impressoras encontradas: {len(printers)}",
                printers=printers,
            )

        if command_type == "restart_spooler":
            output = run_powershell("Restart-Service -Name Spooler -Force; Write-Output 'Spooler reiniciado.'")
            return CommandResult(success=True, output=output)

        if command_type == "clear_print_queue":
            script = r"""
Stop-Service -Name Spooler -Force
Remove-Item -Path "$env:windir\System32\spool\PRINTERS\*" -Force -ErrorAction SilentlyContinue
Start-Service -Name Spooler
Write-Output "Fila de impressão limpa."
"""
            output = run_powershell(script)
            return CommandResult(success=True, output=output)

        if command_type == "set_default_printer":
            printer_name = get_printer_name(payload)
            script = f'(New-Object -ComObject WScript.Network).SetDefaultPrinter("{printer_name}"); Write-Output "Impressora padrão definida: {printer_name}"'
            output = run_powershell(script)
            return CommandResult(success=True, output=output)

        if command_type == "print_test_page":
            printer_name = get_printer_name(payload)
            script = f'rundll32 printui.dll,PrintUIEntry /k /n "{printer_name}"; Write-Output "Página de teste enviada: {printer_name}"'
            output = run_powershell(script)
            return CommandResult(success=True, output=output)

        if command_type == "remove_printer":
            printer_name = get_printer_name(payload)
            script = f'Remove-Printer -Name "{printer_name}"; Write-Output "Impressora removida: {printer_name}"'
            output = run_powershell(script)
            return CommandResult(success=True, output=output)

        if command_type == "restart_service":
            service_name = str(payload.get("service_name") or "Spooler").replace('"', '\\"')
            output = run_powershell(f'Restart-Service -Name "{service_name}" -Force; Write-Output "Serviço reiniciado: {service_name}"')
            return CommandResult(success=True, output=output)

        return CommandResult(
            success=False,
            output=f"Tipo de comando não suportado: {command_type}",
            error_code="UNSUPPORTED_COMMAND",
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output=str(exc),
            error_code="COMMAND_EXECUTION_ERROR",
        )
