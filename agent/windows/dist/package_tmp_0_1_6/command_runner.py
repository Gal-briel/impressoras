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
$ErrorActionPreference = "SilentlyContinue"

$computer = Get-CimInstance Win32_ComputerSystem |
    Select-Object Manufacturer, Model, Name, Domain, TotalPhysicalMemory, SystemType

$bios = Get-CimInstance Win32_BIOS |
    Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber, ReleaseDate

$baseboard = Get-CimInstance Win32_BaseBoard |
    Select-Object Manufacturer, Product, SerialNumber

$cpu = Get-CimInstance Win32_Processor |
    Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation

$disks = Get-CimInstance Win32_DiskDrive | ForEach-Object {
    [ordered]@{
        friendly_name = $_.Model
        model = $_.Model
        serial_number = $_.SerialNumber
        bus_type = $_.InterfaceType
        media_type = $_.MediaType
        size_gb = if ($_.Size) { [math]::Round($_.Size / 1GB, 2) } else { $null }
        health_status = $_.Status
    }
}

$volumes = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $used = if ($_.Size -and $_.FreeSpace -ne $null) { $_.Size - $_.FreeSpace } else { $null }
    [ordered]@{
        drive_letter = $_.DeviceID
        file_system = $_.FileSystem
        file_system_label = $_.VolumeName
        size_gb = if ($_.Size) { [math]::Round($_.Size / 1GB, 2) } else { $null }
        free_gb = if ($_.FreeSpace -ne $null) { [math]::Round($_.FreeSpace / 1GB, 2) } else { $null }
        used_gb = if ($used -ne $null) { [math]::Round($used / 1GB, 2) } else { $null }
        percent = if ($_.Size -and $used -ne $null) { [math]::Round(($used / $_.Size) * 100, 2) } else { $null }
        health_status = $null
    }
}

$gpus = Get-CimInstance Win32_VideoController | ForEach-Object {
    [ordered]@{
        name = $_.Name
        video_processor = $_.VideoProcessor
        adapter_ram_gb = if ($_.AdapterRAM) { [math]::Round($_.AdapterRAM / 1GB, 2) } else { $null }
        driver_version = $_.DriverVersion
        status = $_.Status
    }
}

$net = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true } | ForEach-Object {
    [ordered]@{
        name = $_.Description
        interface_description = $_.Description
        status = $null
        mac_address = $_.MACAddress
        ipv4 = if ($_.IPAddress) { ($_.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }) -join ", " } else { $null }
        link_speed = $null
        default_gateway = $_.DefaultIPGateway
        dns_servers = $_.DNSServerSearchOrder
    }
}

$memoryModules = Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
    [ordered]@{
        device_locator = $_.DeviceLocator
        manufacturer = $_.Manufacturer
        capacity_gb = if ($_.Capacity) { [math]::Round($_.Capacity / 1GB, 2) } else { $null }
        speed_mhz = $_.Speed
        part_number = $_.PartNumber
        serial_number = $_.SerialNumber
    }
}

$tpmResult = [ordered]@{
    present = $null
    ready = $null
    enabled = $null
    activated = $null
    manufacturer = $null
    manufacturer_version = $null
    error = $null
}

try {
    $tpm = Get-Tpm
    if ($null -ne $tpm) {
        $tpmResult.present = $tpm.TpmPresent
        $tpmResult.ready = $tpm.TpmReady
        $tpmResult.enabled = $tpm.TpmEnabled
        $tpmResult.activated = $tpm.TpmActivated
        $tpmResult.manufacturer = $tpm.ManufacturerIdTxt
        $tpmResult.manufacturer_version = $tpm.ManufacturerVersion
    }
} catch {
    $tpmResult.error = $_.Exception.Message
}

$secureBootResult = [ordered]@{
    enabled = $null
    error = $null
}

try {
    $secureBootResult.enabled = Confirm-SecureBootUEFI
} catch {
    $secureBootResult.error = $_.Exception.Message
}

$result = [ordered]@{
    computer = $computer
    computer_system = $computer
    bios = $bios
    baseboard = $baseboard
    cpu = $cpu
    processors = @($cpu)
    disks = @($disks)
    physical_disks = @($disks)
    volumes = @($volumes)
    gpus = @($gpus)
    video_controllers = @($gpus)
    network_adapters = @($net)
    memory_modules = @($memoryModules)
    tpm = $tpmResult
    secure_boot = $secureBootResult
}

$result | ConvertTo-Json -Depth 10
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


def collect_operational_metrics() -> dict[str, Any]:
    script = r"""
$ErrorActionPreference = "SilentlyContinue"

$os = Get-CimInstance Win32_OperatingSystem
$cpuRows = Get-CimInstance Win32_Processor

$cpuPercent = ($cpuRows | Measure-Object -Property LoadPercentage -Average).Average

$totalMemoryBytes = [double]$os.TotalVisibleMemorySize * 1KB
$availableMemoryBytes = [double]$os.FreePhysicalMemory * 1KB
$usedMemoryBytes = $totalMemoryBytes - $availableMemoryBytes

$boot = [System.Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
$now = Get-Date
$uptimeSeconds = [int](New-TimeSpan -Start $boot -End $now).TotalSeconds
$bootEpoch = [int][double](Get-Date -Date $boot -UFormat %s)

$logicalDisks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $usedBytes = if ($_.Size -and $_.FreeSpace -ne $null) { $_.Size - $_.FreeSpace } else { $null }

    [ordered]@{
        device = $_.DeviceID
        mountpoint = "$($_.DeviceID)\"
        fstype = $_.FileSystem
        total_gb = if ($_.Size) { [math]::Round($_.Size / 1GB, 2) } else { $null }
        used_gb = if ($usedBytes -ne $null) { [math]::Round($usedBytes / 1GB, 2) } else { $null }
        free_gb = if ($_.FreeSpace -ne $null) { [math]::Round($_.FreeSpace / 1GB, 2) } else { $null }
        percent = if ($_.Size -and $usedBytes -ne $null) { [math]::Round(($usedBytes / $_.Size) * 100, 2) } else { $null }
    }
}

$result = [ordered]@{
    cpu = [ordered]@{
        percent = if ($cpuPercent -ne $null) { [math]::Round([double]$cpuPercent, 2) } else { $null }
        count_physical = ($cpuRows | Measure-Object -Property NumberOfCores -Sum).Sum
        count_logical = ($cpuRows | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
    }
    memory = [ordered]@{
        total_gb = if ($totalMemoryBytes) { [math]::Round($totalMemoryBytes / 1GB, 2) } else { $null }
        available_gb = if ($availableMemoryBytes -ne $null) { [math]::Round($availableMemoryBytes / 1GB, 2) } else { $null }
        used_gb = if ($usedMemoryBytes -ne $null) { [math]::Round($usedMemoryBytes / 1GB, 2) } else { $null }
        percent = if ($totalMemoryBytes -and $usedMemoryBytes -ne $null) { [math]::Round(($usedMemoryBytes / $totalMemoryBytes) * 100, 2) } else { $null }
    }
    uptime = [ordered]@{
        boot_time_epoch = $bootEpoch
        uptime_seconds = $uptimeSeconds
    }
    disks = @($logicalDisks)
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

        return {}

    except Exception as exc:
        return {
            "error": str(exc),
            "warning": "Erro ao coletar métricas operacionais."
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
        metrics = collect_operational_metrics()
    except Exception as exc:
        metrics = {"error": str(exc)}

    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = None

    try:
        internal_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        internal_ip = None

    if not internal_ip:
        for adapter in hardware.get("network_adapters") or []:
            ipv4 = adapter.get("ipv4")

            if isinstance(ipv4, str) and ipv4:
                internal_ip = ipv4.split(",", 1)[0].strip()
                break

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
        "cpu": metrics.get("cpu"),
        "memory": metrics.get("memory"),
        "uptime": metrics.get("uptime"),
        "disks": metrics.get("disks") or [],
        "spooler": {
            "status": spooler_status,
        },
        "printers": {
            "count": len(printers),
            "error": printer_error,
            "items": printers,
        },
        "hardware": hardware,
        "metrics": metrics,
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
