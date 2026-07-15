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
from network_printer_discovery import discover_network_printers


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

    wrapped_script = (
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); "
        "$OutputEncoding = [System.Text.UTF8Encoding]::new(); "
        + script
    )

    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            wrapped_script,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )

    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())

    return completed.stdout.strip()




def _clean_json_value(value: Any) -> Any:
    """Remove caracteres problemáticos antes de enviar JSON ao backend/PostgreSQL."""
    if isinstance(value, str):
        return (
            value
            .replace("\x00", "")
            .replace("\u0000", "")
            .strip()
        )

    if isinstance(value, list):
        return [_clean_json_value(item) for item in value]

    if isinstance(value, dict):
        return {
            _clean_json_value(key): _clean_json_value(item)
            for key, item in value.items()
        }

    return value


def get_printer_name(payload: dict[str, Any]) -> str:
    printer_name = payload.get("printer_name") or payload.get("name")

    if not printer_name:
        raise ValueError("printer_name ausente no payload do comando.")

    return str(printer_name).replace('"', '\\"')





def _read_agent_base_url() -> str | None:
    try:
        config_path = Path(__file__).resolve().parent / "config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        base_url = str(config.get("base_url") or "").strip().rstrip("/")
        return base_url or None
    except Exception:
        return None


def _validate_update_sha256(value: str) -> str:
    import re

    normalized = str(value or "").strip().lower()

    if not re.fullmatch(r"[a-f0-9]{64}", normalized):
        raise ValueError("Payload obrigatório: sha256 válido com 64 caracteres hexadecimais")

    return normalized


def _normalize_update_package_url(package_url: str) -> str:
    from urllib.parse import urljoin, urlparse

    raw_url = str(package_url or "").strip()
    base_url = _read_agent_base_url()

    if not raw_url:
        raise ValueError("Payload obrigatório: package_url")

    if raw_url.startswith("/"):
        if not base_url:
            raise ValueError("Não foi possível validar package_url relativo sem base_url")
        base = urlparse(base_url)
        raw_url = urljoin(f"{base.scheme}://{base.netloc}", raw_url)

    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()

    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("package_url inválido")

    if parsed.scheme != "https" and host not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("package_url precisa usar HTTPS")

    if parsed.query or parsed.fragment:
        raise ValueError("package_url não pode conter query string ou fragmento")

    if not parsed.path.startswith("/agent-packages/"):
        raise ValueError("package_url precisa apontar para /agent-packages/")

    if not parsed.path.lower().endswith(".zip"):
        raise ValueError("package_url precisa apontar para um pacote .zip")

    if base_url:
        base = urlparse(base_url)
        if parsed.netloc.lower() != base.netloc.lower():
            raise ValueError("package_url precisa usar o mesmo host configurado no agente")

    return raw_url


def update_agent(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}

    package_url = payload.get("package_url")
    expected_sha256 = payload.get("sha256")
    new_version = payload.get("version")
    task_name = payload.get("task_name") or "PrinterBridge Windows Agent"

    try:
        package_url = _normalize_update_package_url(str(package_url or ""))
        expected_sha256 = _validate_update_sha256(str(expected_sha256 or ""))
    except ValueError as exc:
        return {
            "status": "error",
            "message": str(exc),
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

    $TempRoot = Join-Path $env:TEMP ("printerbridge-agent-update-" + [guid]::NewGuid().ToString())
    $ZipPath = Join-Path $TempRoot "agent.zip"
    $ExtractDir = Join-Path $TempRoot "extract"

    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null

    $ConfigPath = Join-Path $InstallDir "config.json"

    if (-not (Test-Path $ConfigPath)) {{
        throw "config.json não encontrado para autenticar download do pacote."
    }}

    $AgentConfig = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    $AgentId = [string]$AgentConfig.agent_id
    $AgentApiKey = [string]$AgentConfig.api_key

    if (-not $AgentId -or -not $AgentApiKey) {{
        throw "agent_id/api_key ausentes no config.json para download do pacote."
    }}

    $DownloadHeaders = @{{
        "x-agent-id" = $AgentId
        "Authorization" = "ApiKey $AgentApiKey"
    }}

    Write-UpdateLog "Baixando pacote autenticado..."
    Invoke-WebRequest -Uri $PackageUrl -OutFile $ZipPath -UseBasicParsing -Headers $DownloadHeaders

    if (-not $ExpectedSha256 -or $ExpectedSha256.Length -ne 64) {{
        throw "SHA256 obrigatório ou inválido."
    }}

    Write-UpdateLog "Validando SHA256..."
    $ActualSha256 = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()

    if ($ActualSha256 -ne $ExpectedSha256.ToLower()) {{
        throw "SHA256 inválido. Esperado=$ExpectedSha256 Atual=$ActualSha256"
    }}

    Write-UpdateLog "SHA256 validado."

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
    Select-Object Manufacturer, Model, Name, Domain, TotalPhysicalMemory, SystemType, HypervisorPresent

$bios = Get-CimInstance Win32_BIOS |
    Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber, ReleaseDate

$baseboard = Get-CimInstance Win32_BaseBoard |
    Select-Object Manufacturer, Product, Version, SerialNumber

$cpu = Get-CimInstance Win32_Processor |
    Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation, VirtualizationFirmwareEnabled, VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions

$virtualization = [ordered]@{
    hypervisor_present = $computer.HypervisorPresent
    firmware_enabled = $null
    vm_monitor_mode_extensions = $null
    second_level_address_translation = $null
}

if ($cpu) {
    $firstCpu = @($cpu)[0]
    $virtualization.firmware_enabled = $firstCpu.VirtualizationFirmwareEnabled
    $virtualization.vm_monitor_mode_extensions = $firstCpu.VMMonitorModeExtensions
    $virtualization.second_level_address_translation = $firstCpu.SecondLevelAddressTranslationExtensions
}

$netAdapterByMac = @{}
try {
    Get-NetAdapter | ForEach-Object {
        $mac = if ($_.MacAddress) { $_.MacAddress.Replace("-", ":").ToUpperInvariant() } else { $null }
        if ($mac) {
            $netAdapterByMac[$mac] = $_
        }
    }
} catch {}

$net = Get-CimInstance Win32_NetworkAdapterConfiguration |
    Where-Object { $_.IPEnabled -eq $true } |
    ForEach-Object {
        $macNormalized = if ($_.MACAddress) { $_.MACAddress.Replace("-", ":").ToUpperInvariant() } else { $null }
        $adapter = if ($macNormalized -and $netAdapterByMac.ContainsKey($macNormalized)) { $netAdapterByMac[$macNormalized] } else { $null }

        [ordered]@{
            name = if ($adapter) { $adapter.Name } else { $_.Description }
            interface_description = $_.Description
            status = if ($adapter) { [string]$adapter.Status } else { $null }
            mac_address = $_.MACAddress
            ipv4 = if ($_.IPAddress) { ($_.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }) -join ", " } else { $null }
            link_speed = if ($adapter) { [string]$adapter.LinkSpeed } else { $null }
            media_connection_state = if ($adapter) { [string]$adapter.MediaConnectionState } else { $null }
            interface_index = if ($adapter) { $adapter.ifIndex } else { $null }
            default_gateway = $_.DefaultIPGateway
            dns_servers = $_.DNSServerSearchOrder
            dhcp_enabled = $_.DHCPEnabled
            dhcp_server = $_.DHCPServer
        }
    }

$physicalDiskMap = @{}
try {
    Get-PhysicalDisk | ForEach-Object {
        $key = if ($_.SerialNumber) { $_.SerialNumber.Trim() } else { $_.FriendlyName }
        if ($key) {
            $physicalDiskMap[$key] = $_
        }
    }
} catch {}

$reliabilityByDeviceId = @{}
try {
    Get-PhysicalDisk | Get-StorageReliabilityCounter | ForEach-Object {
        if ($_.DeviceId -ne $null) {
            $reliabilityByDeviceId[[string]$_.DeviceId] = $_
        }
    }
} catch {}

$smartStatus = @()
try {
    $smartStatus = Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus |
        ForEach-Object {
            [ordered]@{
                instance_name = $_.InstanceName
                predict_failure = $_.PredictFailure
                reason = $_.Reason
            }
        }
} catch {}

$disks = Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $serial = if ($_.SerialNumber) { $_.SerialNumber.Trim() } else { $null }
    $physical = $null

    if ($serial -and $physicalDiskMap.ContainsKey($serial)) {
        $physical = $physicalDiskMap[$serial]
    } elseif ($physicalDiskMap.ContainsKey($_.Model)) {
        $physical = $physicalDiskMap[$_.Model]
    }

    $reliability = $null
    if ($physical -and $physical.DeviceId -ne $null) {
        $deviceKey = [string]$physical.DeviceId
        if ($reliabilityByDeviceId.ContainsKey($deviceKey)) {
            $reliability = $reliabilityByDeviceId[$deviceKey]
        }
    }

    [ordered]@{
        friendly_name = if ($physical) { $physical.FriendlyName } else { $_.Model }
        model = $_.Model
        serial_number = $_.SerialNumber
        bus_type = if ($physical) { [string]$physical.BusType } else { $_.InterfaceType }
        media_type = if ($physical) { [string]$physical.MediaType } else { $_.MediaType }
        size_gb = if ($_.Size) { [math]::Round($_.Size / 1GB, 2) } else { $null }
        health_status = if ($physical) { [string]$physical.HealthStatus } else { $_.Status }
        operational_status = if ($physical) { ($physical.OperationalStatus -join ", ") } else { $null }
        usage = if ($physical) { [string]$physical.Usage } else { $null }
        firmware_version = if ($physical) { $physical.FirmwareVersion } else { $null }
        temperature_celsius = if ($reliability) { $reliability.Temperature } else { $null }
        wear = if ($reliability) { $reliability.Wear } else { $null }
        read_errors_total = if ($reliability) { $reliability.ReadErrorsTotal } else { $null }
        write_errors_total = if ($reliability) { $reliability.WriteErrorsTotal } else { $null }
        power_on_hours = if ($reliability) { $reliability.PowerOnHours } else { $null }
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
    virtualization = $virtualization
    disks = @($disks)
    physical_disks = @($disks)
    volumes = @($volumes)
    smart_status = @($smartStatus)
    gpus = @($gpus)
    video_controllers = @($gpus)
    network_adapters = @($net)
    memory_modules = @($memoryModules)
    tpm = $tpmResult
    secure_boot = $secureBootResult
}

$result | ConvertTo-Json -Depth 12
"""

    try:
        output = run_powershell(script, timeout=180)

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

$bootRaw = $os.LastBootUpTime

if ($bootRaw -is [datetime]) {
    $boot = $bootRaw
} else {
    try {
        $boot = [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$bootRaw)
    } catch {
        $boot = $null
    }
}

$now = Get-Date

if ($boot) {
    $uptimeSeconds = [int][math]::Floor(($now - $boot).TotalSeconds)
    $bootEpoch = [int][math]::Floor(($boot.ToUniversalTime() - [datetime]'1970-01-01').TotalSeconds)
    $uptimeText = ("{0}d {1}h {2}m" -f `
        [int][math]::Floor($uptimeSeconds / 86400), `
        [int][math]::Floor(($uptimeSeconds % 86400) / 3600), `
        [int][math]::Floor(($uptimeSeconds % 3600) / 60))
} else {
    $uptimeSeconds = $null
    $bootEpoch = $null
    $uptimeText = $null
}

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
        boot_time = if ($boot) { $boot.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        text = $uptimeText
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


def _pick_primary_adapter(hardware: dict[str, Any]) -> dict[str, Any] | None:
    adapters = hardware.get("network_adapters") or []

    if not isinstance(adapters, list):
        return None

    ignored_terms = [
        "vpn",
        "virtual",
        "loopback",
        "tap",
        "fortinet",
        "bluetooth",
        "hyper-v",
        "wan miniport",
    ]

    def has_ipv4(adapter: dict[str, Any]) -> bool:
        return bool(adapter.get("ipv4"))

    def has_gateway(adapter: dict[str, Any]) -> bool:
        gateway = adapter.get("default_gateway")
        return bool(gateway)

    def is_physical(adapter: dict[str, Any]) -> bool:
        text = " ".join(
            str(adapter.get(key) or "")
            for key in ["name", "interface_description"]
        ).lower()

        return not any(term in text for term in ignored_terms)

    candidates = [
        adapter
        for adapter in adapters
        if isinstance(adapter, dict) and has_ipv4(adapter) and has_gateway(adapter) and is_physical(adapter)
    ]

    if candidates:
        return candidates[0]

    candidates = [
        adapter
        for adapter in adapters
        if isinstance(adapter, dict) and has_ipv4(adapter) and is_physical(adapter)
    ]

    if candidates:
        return candidates[0]

    for adapter in adapters:
        if isinstance(adapter, dict) and has_ipv4(adapter):
            return adapter

    return None


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

    primary_adapter = _pick_primary_adapter(hardware)

    internal_ip = None

    if primary_adapter:
        ipv4 = primary_adapter.get("ipv4")

        if isinstance(ipv4, str) and ipv4:
            internal_ip = ipv4.split(",", 1)[0].strip()

    if not internal_ip:
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
            "mac_address": primary_adapter.get("mac_address") if primary_adapter else None,
            "adapter_name": primary_adapter.get("name") if primary_adapter else None,
            "interface_description": primary_adapter.get("interface_description") if primary_adapter else None,
            "status": primary_adapter.get("status") if primary_adapter else None,
            "link_speed": primary_adapter.get("link_speed") if primary_adapter else None,
            "media_connection_state": primary_adapter.get("media_connection_state") if primary_adapter else None,
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

    output = _clean_json_value(output)
    printers = _clean_json_value(printers)

    return CommandResult(
        success=True,
        output=output,
        printers=printers,
    )




def _safe_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default

    return max(minimum, min(maximum, number))


def collect_processes(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    limit = _safe_int(payload.get("limit"), default=50, minimum=1, maximum=500)
    sort_by = str(payload.get("sort_by") or "memory").lower()

    if sort_by not in {"memory", "cpu", "name", "pid"}:
        sort_by = "memory"

    try:
        import psutil
    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "psutil não disponível para coletar processos.",
                "error": str(exc),
            },
            error_code="PSUTIL_NOT_AVAILABLE",
        )

    items: list[dict[str, Any]] = []

    for proc in psutil.process_iter(["pid", "name", "username", "create_time", "exe"]):
        try:
            info = proc.info
            mem = proc.memory_info()
            cpu_times = proc.cpu_times()

            cpu_seconds = round((cpu_times.user or 0) + (cpu_times.system or 0), 2)

            try:
                start_time = datetime.fromtimestamp(info.get("create_time")).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                start_time = None

            items.append({
                "pid": info.get("pid"),
                "name": info.get("name"),
                "username": info.get("username"),
                "cpu_seconds": cpu_seconds,
                "memory_mb": round((mem.rss or 0) / 1024 / 1024, 2),
                "private_memory_mb": round((getattr(mem, "private", 0) or 0) / 1024 / 1024, 2),
                "start_time": start_time,
                "path": info.get("exe"),
            })

        except Exception:
            continue

    if sort_by == "memory":
        items.sort(key=lambda item: item.get("memory_mb") or 0, reverse=True)
    elif sort_by == "cpu":
        items.sort(key=lambda item: item.get("cpu_seconds") or 0, reverse=True)
    elif sort_by == "name":
        items.sort(key=lambda item: str(item.get("name") or "").lower())
    elif sort_by == "pid":
        items.sort(key=lambda item: item.get("pid") or 0)

    items = items[:limit]

    return CommandResult(
        success=True,
        output=_clean_json_value({
            "count": len(items),
            "limit": limit,
            "sort_by": sort_by,
            "items": items,
        }),
    )




def collect_services(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    status_filter = str(payload.get("status") or "").strip().lower()
    limit = _safe_int(payload.get("limit"), default=300, minimum=1, maximum=1000)

    try:
        import psutil
    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "psutil não disponível para coletar serviços.",
                "error": str(exc),
            },
            error_code="PSUTIL_NOT_AVAILABLE",
        )

    items: list[dict[str, Any]] = []

    try:
        for service in psutil.win_service_iter():
            try:
                service_info = service.as_dict()

                status = str(service_info.get("status") or "")
                display_name = service_info.get("display_name") or service_info.get("name") or ""
                name = service_info.get("name") or ""

                if status_filter and status.lower() != status_filter:
                    continue

                items.append({
                    "name": name,
                    "display_name": display_name,
                    "status": status,
                    "startup_type": service_info.get("start_type"),
                    "start_name": service_info.get("username"),
                    "process_id": service_info.get("pid"),
                    "path_name": service_info.get("binpath"),
                    "description": service_info.get("description"),
                })

            except Exception:
                continue

        items.sort(key=lambda item: str(item.get("display_name") or item.get("name") or "").lower())
        items = items[:limit]

        return CommandResult(
            success=True,
            output=_clean_json_value({
                "count": len(items),
                "limit": limit,
                "status_filter": status_filter or None,
                "items": items,
            }),
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao coletar serviços.",
                "error": str(exc),
            },
            error_code="COLLECT_SERVICES_FAILED",
        )


def reboot_machine(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    confirm = str(payload.get("confirm") or "").strip().upper()

    if confirm != "REBOOT":
        return CommandResult(
            success=False,
            output={
                "message": "Comando recusado. Envie payload.confirm = REBOOT para confirmar reinicialização.",
            },
            error_code="REBOOT_CONFIRMATION_REQUIRED",
        )

    delay_seconds = _safe_int(payload.get("delay_seconds"), default=60, minimum=0, maximum=3600)
    reason = str(payload.get("reason") or "Reinicialização solicitada pelo Gabriel.").replace('"', "'")

    try:
        output = run_powershell(
            f'shutdown.exe /r /t {delay_seconds} /c "{reason}"',
            timeout=30,
        )

        return CommandResult(
            success=True,
            output={
                "message": "Reinicialização agendada.",
                "delay_seconds": delay_seconds,
                "reason": reason,
                "output": output,
            },
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao agendar reinicialização.",
                "error": str(exc),
            },
            error_code="REBOOT_FAILED",
        )


def shutdown_machine(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    confirm = str(payload.get("confirm") or "").strip().upper()

    if confirm != "SHUTDOWN":
        return CommandResult(
            success=False,
            output={
                "message": "Comando recusado. Envie payload.confirm = SHUTDOWN para confirmar desligamento.",
            },
            error_code="SHUTDOWN_CONFIRMATION_REQUIRED",
        )

    delay_seconds = _safe_int(payload.get("delay_seconds"), default=60, minimum=0, maximum=3600)
    reason = str(payload.get("reason") or "Desligamento solicitado pelo Gabriel.").replace('"', "'")

    try:
        output = run_powershell(
            f'shutdown.exe /s /t {delay_seconds} /c "{reason}"',
            timeout=30,
        )

        return CommandResult(
            success=True,
            output={
                "message": "Desligamento agendado.",
                "delay_seconds": delay_seconds,
                "reason": reason,
                "output": output,
            },
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao agendar desligamento.",
                "error": str(exc),
            },
            error_code="SHUTDOWN_FAILED",
        )


def cancel_power_action(payload: dict[str, Any] | None = None) -> CommandResult:
    try:
        output = run_powershell("shutdown.exe /a", timeout=30)

        return CommandResult(
            success=True,
            output={
                "message": "Ação de desligamento/reinicialização cancelada.",
                "output": output,
            },
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao cancelar ação de energia. Talvez não exista ação agendada.",
                "error": str(exc),
            },
            error_code="CANCEL_POWER_ACTION_FAILED",
        )





PROTECTED_PROCESS_NAMES = {
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "fontdrvhost.exe",
    "dwm.exe",
    "memory compression",
    "memcompression",
}

PROTECTED_SERVICE_NAMES = {
    "rpcss",
    "dcomlaunch",
    "plugplay",
    "eventlog",
    "samss",
    "winmgmt",
    "w32time",
    "nlasvc",
    "netprofm",
    "dhcp",
    "dnscache",
    "mpssvc",
    "windefend",
    "securityhealthservice",
    "schedule",
    "lanmanworkstation",
    "lanmanserver",
}


def kill_process(payload: dict[str, Any] | None = None) -> CommandResult:
    """Encerra processos com escopo controlado.

    payload:
      - process_id / pid: PID alvo
      - process_name: nome do processo, ex: chrome.exe
      - scope:
          single       -> encerra apenas o PID
          tree         -> encerra PID e filhos
          all_by_name  -> encerra todos pelo nome
          browser_root -> encerra o aplicativo/navegador inteiro pelo nome
    """
    import json
    import subprocess

    payload = payload or {}

    raw_pid = payload.get("process_id") or payload.get("pid")
    process_name = str(payload.get("process_name") or "").strip()
    scope = str(payload.get("scope") or "single").strip().lower()

    allowed_scopes = {"single", "tree", "all_by_name", "browser_root"}

    if scope not in allowed_scopes:
        return CommandResult(
            success=False,
            output=json.dumps(
                {
                    "message": "Escopo inválido.",
                    "scope": scope,
                    "allowed_scopes": sorted(allowed_scopes),
                },
                ensure_ascii=False,
            ),
            error_code="INVALID_KILL_SCOPE",
        )

    pid = None
    if raw_pid not in (None, ""):
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError):
            return CommandResult(
                success=False,
                output=json.dumps(
                    {"message": "PID inválido.", "pid": raw_pid},
                    ensure_ascii=False,
                ),
                error_code="INVALID_PROCESS_ID",
            )

    if pid is not None and pid <= 0:
        return CommandResult(
            success=False,
            output=json.dumps(
                {"message": "PID inválido.", "pid": pid},
                ensure_ascii=False,
            ),
            error_code="INVALID_PROCESS_ID",
        )

    if not pid and not process_name:
        return CommandResult(
            success=False,
            output=json.dumps(
                {"message": "Informe process_id/pid ou process_name."},
                ensure_ascii=False,
            ),
            error_code="PROCESS_TARGET_REQUIRED",
        )

    # Proteção extra local: não usa shell=True, mas ainda valida nome.
    if process_name:
        dangerous_chars = set('`"\\\';;&|<>$')
        if any(ch in dangerous_chars for ch in process_name) or any(ord(ch) < 32 for ch in process_name):
            return CommandResult(
                success=False,
                output=json.dumps(
                    {"message": "Nome de processo inseguro.", "process_name": process_name},
                    ensure_ascii=False,
                ),
                error_code="UNSAFE_PROCESS_NAME",
            )

    def run_taskkill(args: list[str]) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["taskkill", *args],
            capture_output=True,
            text=True,
            timeout=30,
            shell=False,
        )

    def normalize_output(proc: subprocess.CompletedProcess) -> str:
        output = "\n".join(
            item for item in [proc.stdout.strip(), proc.stderr.strip()] if item
        ).strip()
        return output or f"taskkill exit code {proc.returncode}"

    def looks_not_found(output: str) -> bool:
        lower = output.lower()
        return (
            "not found" in lower
            or "não encontrado" in lower
            or "nao encontrado" in lower
            or "no running instance" in lower
            or "nenhuma instância" in lower
            or "nenhuma instancia" in lower
        )

    if scope == "single":
        if not pid:
            return CommandResult(
                success=False,
                output=json.dumps(
                    {
                        "message": "Para scope=single informe process_id/pid.",
                        "process_name": process_name or None,
                    },
                    ensure_ascii=False,
                ),
                error_code="PROCESS_ID_REQUIRED",
            )

        proc = run_taskkill(["/PID", str(pid), "/F"])
        output = normalize_output(proc)

    elif scope == "tree":
        if not pid:
            return CommandResult(
                success=False,
                output=json.dumps(
                    {
                        "message": "Para scope=tree informe process_id/pid.",
                        "process_name": process_name or None,
                    },
                    ensure_ascii=False,
                ),
                error_code="PROCESS_ID_REQUIRED",
            )

        proc = run_taskkill(["/PID", str(pid), "/T", "/F"])
        output = normalize_output(proc)

    elif scope in {"all_by_name", "browser_root"}:
        if not process_name:
            return CommandResult(
                success=False,
                output=json.dumps(
                    {
                        "message": f"Para scope={scope} informe process_name.",
                        "pid": pid,
                    },
                    ensure_ascii=False,
                ),
                error_code="PROCESS_NAME_REQUIRED",
            )

        # Para navegadores, isso fecha todas as abas/janelas e subprocessos.
        proc = run_taskkill(["/IM", process_name, "/T", "/F"])
        output = normalize_output(proc)

    else:
        return CommandResult(
            success=False,
            output=json.dumps({"message": "Escopo inválido."}, ensure_ascii=False),
            error_code="INVALID_KILL_SCOPE",
        )

    if proc.returncode == 0:
        return CommandResult(
            success=True,
            output=json.dumps(
                {
                    "message": "Processo encerrado com sucesso.",
                    "scope": scope,
                    "pid": pid,
                    "process_name": process_name or None,
                    "taskkill_output": output,
                },
                ensure_ascii=False,
            ),
            error_code=None,
        )

    if looks_not_found(output):
        return CommandResult(
            success=False,
            output=json.dumps(
                {
                    "message": "Processo não encontrado. A lista pode estar desatualizada. Colete processos novamente.",
                    "scope": scope,
                    "pid": pid,
                    "process_name": process_name or None,
                    "taskkill_output": output,
                },
                ensure_ascii=False,
            ),
            error_code="PROCESS_NOT_FOUND",
        )

    return CommandResult(
        success=False,
        output=json.dumps(
            {
                "message": "Falha ao encerrar processo.",
                "scope": scope,
                "pid": pid,
                "process_name": process_name or None,
                "taskkill_output": output,
                "exit_code": proc.returncode,
            },
            ensure_ascii=False,
        ),
        error_code="KILL_PROCESS_FAILED",
    )

def _run_service_action(
    payload: dict[str, Any] | None,
    action: str,
    confirmation_word: str,
) -> CommandResult:
    payload = payload or {}

    confirm = str(payload.get("confirm") or "").strip().upper()

    if confirm != confirmation_word:
        return CommandResult(
            success=False,
            output={
                "message": f"Comando recusado. Envie payload.confirm = {confirmation_word} para confirmar.",
            },
            error_code=f"SERVICE_{confirmation_word}_CONFIRMATION_REQUIRED",
        )

    service_name = str(payload.get("service_name") or payload.get("name") or "").strip()

    if not service_name:
        return CommandResult(
            success=False,
            output={
                "message": "Informe service_name.",
            },
            error_code="SERVICE_NAME_REQUIRED",
        )

    if action in {"stop", "restart"} and service_name.lower() in PROTECTED_SERVICE_NAMES:
        return CommandResult(
            success=False,
            output={
                "message": "Serviço protegido. Ação bloqueada por segurança.",
                "service_name": service_name,
                "action": action,
            },
            error_code="PROTECTED_SERVICE",
        )

    service_name_ps = service_name.replace("'", "''")

    if action == "start":
        command = f"""
$ErrorActionPreference = "Stop"
$svc = Get-Service -Name '{service_name_ps}'
Start-Service -Name $svc.Name
Start-Sleep -Seconds 2
$svc = Get-Service -Name '{service_name_ps}'
[ordered]@{{
    name = $svc.Name
    display_name = $svc.DisplayName
    status = [string]$svc.Status
}} | ConvertTo-Json -Depth 4
"""
    elif action == "stop":
        command = f"""
$ErrorActionPreference = "Stop"
$svc = Get-Service -Name '{service_name_ps}'
Stop-Service -Name $svc.Name -Force
Start-Sleep -Seconds 2
$svc = Get-Service -Name '{service_name_ps}'
[ordered]@{{
    name = $svc.Name
    display_name = $svc.DisplayName
    status = [string]$svc.Status
}} | ConvertTo-Json -Depth 4
"""
    elif action == "restart":
        command = f"""
$ErrorActionPreference = "Stop"
$svc = Get-Service -Name '{service_name_ps}'
Restart-Service -Name $svc.Name -Force
Start-Sleep -Seconds 2
$svc = Get-Service -Name '{service_name_ps}'
[ordered]@{{
    name = $svc.Name
    display_name = $svc.DisplayName
    status = [string]$svc.Status
}} | ConvertTo-Json -Depth 4
"""
    else:
        return CommandResult(
            success=False,
            output={"message": "Ação de serviço inválida."},
            error_code="INVALID_SERVICE_ACTION",
        )

    try:
        output = run_powershell(command, timeout=90)
        data = json.loads(output) if output else {}

        return CommandResult(
            success=True,
            output=_clean_json_value({
                "message": f"Ação '{action}' executada no serviço.",
                "service_name": service_name,
                "action": action,
                "service": data,
            }),
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": f"Falha ao executar ação '{action}' no serviço.",
                "service_name": service_name,
                "error": str(exc),
            },
            error_code=f"SERVICE_{confirmation_word}_FAILED",
        )


def start_service(payload: dict[str, Any] | None = None) -> CommandResult:
    return _run_service_action(payload, "start", "START")


def stop_service(payload: dict[str, Any] | None = None) -> CommandResult:
    return _run_service_action(payload, "stop", "STOP")


def restart_service(payload: dict[str, Any] | None = None) -> CommandResult:
    return _run_service_action(payload, "restart", "RESTART")




def collect_software_inventory(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    limit = _safe_int(payload.get("limit"), default=300, minimum=1, maximum=3000)
    search = str(payload.get("search") or "").strip()

    include_store_apps = bool(payload.get("include_store_apps", False))
    include_package_provider = bool(payload.get("include_package_provider", False))

    search_ps = search.replace("'", "''")
    include_store_apps_ps = "$true" if include_store_apps else "$false"
    include_package_provider_ps = "$true" if include_package_provider else "$false"

    script = r"""
$ErrorActionPreference = "SilentlyContinue"

$Search = '__SEARCH__'
$Limit = __LIMIT__
$IncludeStoreApps = __INCLUDE_STORE_APPS__
$IncludePackageProvider = __INCLUDE_PACKAGE_PROVIDER__

$items = @()
$rawCounts = [ordered]@{
    machine_registry = 0
    user_registry = 0
    package_provider = 0
    appx_store = 0
}

$registryPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

foreach ($path in $registryPaths) {
    $machineItems = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        ForEach-Object {
            [pscustomobject][ordered]@{
                name = $_.DisplayName
                version = $_.DisplayVersion
                publisher = $_.Publisher
                install_date = $_.InstallDate
                estimated_size_mb = if ($_.EstimatedSize) { [math]::Round([double]$_.EstimatedSize / 1024, 2) } else { $null }
                install_location = $_.InstallLocation
                uninstall_string = $_.UninstallString
                registry_key = $_.PSChildName
                source = 'machine_registry'
                user_sid = $null
            }
        }

    $rawCounts.machine_registry += @($machineItems).Count
    $items += $machineItems
}

$userUninstallRoots = Get-ChildItem Registry::HKEY_USERS -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -match 'S-1-5-21-' -and
        $_.Name -notmatch '_Classes$'
    }

foreach ($root in $userUninstallRoots) {
    $sid = Split-Path $root.Name -Leaf

    $userPaths = @(
        "Registry::$($root.Name)\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::$($root.Name)\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($path in $userPaths) {
        $userItems = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName } |
            ForEach-Object {
                [pscustomobject][ordered]@{
                    name = $_.DisplayName
                    version = $_.DisplayVersion
                    publisher = $_.Publisher
                    install_date = $_.InstallDate
                    estimated_size_mb = if ($_.EstimatedSize) { [math]::Round([double]$_.EstimatedSize / 1024, 2) } else { $null }
                    install_location = $_.InstallLocation
                    uninstall_string = $_.UninstallString
                    registry_key = $_.PSChildName
                    source = 'user_registry'
                    user_sid = $sid
                }
            }

        $rawCounts.user_registry += @($userItems).Count
        $items += $userItems
    }
}

if ($IncludePackageProvider) {
    try {
        $packageItems = Get-Package -ErrorAction SilentlyContinue |
            Where-Object { $_.Name } |
            Select-Object -First 500 |
            ForEach-Object {
                [pscustomobject][ordered]@{
                    name = $_.Name
                    version = if ($_.Version) { [string]$_.Version } else { $null }
                    publisher = $_.ProviderName
                    install_date = $null
                    estimated_size_mb = $null
                    install_location = $null
                    uninstall_string = $null
                    registry_key = $null
                    source = 'package_provider'
                    user_sid = $null
                }
            }

        $rawCounts.package_provider = @($packageItems).Count
        $items += $packageItems
    } catch {}
}

if ($IncludeStoreApps) {
    try {
        $storeApps = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
            Where-Object { $_.Name } |
            Select-Object -First 500 |
            ForEach-Object {
                [pscustomobject][ordered]@{
                    name = $_.Name
                    version = if ($_.Version) { [string]$_.Version } else { $null }
                    publisher = $_.Publisher
                    install_date = $null
                    estimated_size_mb = $null
                    install_location = $_.InstallLocation
                    uninstall_string = $null
                    registry_key = $_.PackageFullName
                    source = 'appx_store'
                    user_sid = $null
                }
            }

        $rawCounts.appx_store = @($storeApps).Count
        $items += $storeApps
    } catch {}
}

if ($Search) {
    $items = $items | Where-Object {
        ($_.name -like "*$Search*") -or
        ($_.publisher -like "*$Search*") -or
        ($_.version -like "*$Search*") -or
        ($_.source -like "*$Search*")
    }
}

$uniqueItems = $items |
    Where-Object { $_.name } |
    Group-Object name, version, publisher, source |
    ForEach-Object { $_.Group[0] } |
    Sort-Object name |
    Select-Object -First $Limit

$bySource = @($uniqueItems) |
    Group-Object source |
    ForEach-Object {
        [pscustomobject][ordered]@{
            source = $_.Name
            count = $_.Count
        }
    }

[pscustomobject][ordered]@{
    count = @($uniqueItems).Count
    limit = $Limit
    search = if ($Search) { $Search } else { $null }
    include_store_apps = $IncludeStoreApps
    include_package_provider = $IncludePackageProvider
    raw_counts = $rawCounts
    sources = @($bySource)
    items = @($uniqueItems)
} | ConvertTo-Json -Depth 8
"""

    script = (
        script
        .replace("__SEARCH__", search_ps)
        .replace("__LIMIT__", str(limit))
        .replace("__INCLUDE_STORE_APPS__", include_store_apps_ps)
        .replace("__INCLUDE_PACKAGE_PROVIDER__", include_package_provider_ps)
    )

    try:
        output = run_powershell(script, timeout=300)
        data = json.loads(output) if output else {"items": []}

        return CommandResult(
            success=True,
            output=_clean_json_value(data),
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao coletar inventário de software.",
                "error": str(exc),
            },
            error_code="COLLECT_SOFTWARE_INVENTORY_FAILED",
        )


def collect_security_inventory(payload: dict[str, Any] | None = None) -> CommandResult:
    payload = payload or {}

    hotfix_limit = _safe_int(payload.get("hotfix_limit"), default=20, minimum=1, maximum=300)
    software_limit = _safe_int(payload.get("software_limit"), default=30, minimum=1, maximum=500)

    include_usb = bool(payload.get("include_usb", False))
    include_monitors = bool(payload.get("include_monitors", False))
    include_local_groups = bool(payload.get("include_local_groups", False))
    include_recent_software = bool(payload.get("include_recent_software", False))

    include_usb_ps = "$true" if include_usb else "$false"
    include_monitors_ps = "$true" if include_monitors else "$false"
    include_local_groups_ps = "$true" if include_local_groups else "$false"
    include_recent_software_ps = "$true" if include_recent_software else "$false"

    script = r"""
$ErrorActionPreference = "SilentlyContinue"

$HotfixLimit = __HOTFIX_LIMIT__
$SoftwareLimit = __SOFTWARE_LIMIT__
$IncludeUsb = __INCLUDE_USB__
$IncludeMonitors = __INCLUDE_MONITORS__
$IncludeLocalGroups = __INCLUDE_LOCAL_GROUPS__
$IncludeRecentSoftware = __INCLUDE_RECENT_SOFTWARE__

function Convert-EdidString {
    param($Value)

    if ($null -eq $Value) {
        return $null
    }

    try {
        $chars = $Value | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }
        return (($chars -join '').Trim())
    } catch {
        return $null
    }
}

$antivirus = @()
try {
    $antivirus = Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct |
        ForEach-Object {
            [ordered]@{
                display_name = $_.displayName
                instance_guid = $_.instanceGuid
                path_to_signed_product_exe = $_.pathToSignedProductExe
                path_to_signed_reporting_exe = $_.pathToSignedReportingExe
                product_state = $_.productState
                timestamp = $_.timestamp
            }
        }
} catch {}

$defender = [ordered]@{
    available = $false
    error = $null
}

try {
    $mp = Get-MpComputerStatus

    $defender = [ordered]@{
        available = $true
        antivirus_enabled = $mp.AntivirusEnabled
        real_time_protection_enabled = $mp.RealTimeProtectionEnabled
        antispyware_enabled = $mp.AntispywareEnabled
        behavior_monitor_enabled = $mp.BehaviorMonitorEnabled
        ioav_protection_enabled = $mp.IoavProtectionEnabled
        nise_enabled = $mp.NISEnabled
        quick_scan_age = $mp.QuickScanAge
        full_scan_age = $mp.FullScanAge
        antivirus_signature_last_updated = if ($mp.AntivirusSignatureLastUpdated) { $mp.AntivirusSignatureLastUpdated.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        antispyware_signature_last_updated = if ($mp.AntispywareSignatureLastUpdated) { $mp.AntispywareSignatureLastUpdated.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        engine_version = $mp.AMEngineVersion
        product_version = $mp.AMProductVersion
        product_status = $mp.ProductStatus
    }
} catch {
    $defender.error = $_.Exception.Message
}

$bitlocker = @()
try {
    $bitlocker = Get-BitLockerVolume |
        ForEach-Object {
            [ordered]@{
                mount_point = $_.MountPoint
                volume_status = [string]$_.VolumeStatus
                protection_status = [string]$_.ProtectionStatus
                encryption_percentage = $_.EncryptionPercentage
                encryption_method = [string]$_.EncryptionMethod
                lock_status = [string]$_.LockStatus
                key_protectors = @($_.KeyProtector | ForEach-Object { [string]$_.KeyProtectorType })
            }
        }
} catch {}

$firewall = @()
try {
    $firewall = Get-NetFirewallProfile |
        ForEach-Object {
            [ordered]@{
                name = $_.Name
                enabled = $_.Enabled
                default_inbound_action = [string]$_.DefaultInboundAction
                default_outbound_action = [string]$_.DefaultOutboundAction
                allow_inbound_rules = $_.AllowInboundRules
                allow_local_firewall_rules = $_.AllowLocalFirewallRules
                notify_on_listen = $_.NotifyOnListen
            }
        }
} catch {}

$hotfixes = @()
try {
    $hotfixes = Get-HotFix |
        Sort-Object InstalledOn -Descending |
        Select-Object -First $HotfixLimit |
        ForEach-Object {
            [ordered]@{
                hotfix_id = $_.HotFixID
                description = $_.Description
                installed_by = $_.InstalledBy
                installed_on = if ($_.InstalledOn) { $_.InstalledOn.ToString("yyyy-MM-dd") } else { $null }
            }
        }
} catch {}

$updateServices = @()
try {
    $updateServices = Get-Service -Name wuauserv,bits -ErrorAction SilentlyContinue |
        ForEach-Object {
            [ordered]@{
                name = $_.Name
                display_name = $_.DisplayName
                status = [string]$_.Status
                startup_type = [string]$_.StartType
            }
        }
} catch {}

$localUsers = @()
try {
    $localUsers = Get-LocalUser |
        ForEach-Object {
            [ordered]@{
                name = $_.Name
                enabled = $_.Enabled
                last_logon = if ($_.LastLogon) { $_.LastLogon.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
                password_required = $_.PasswordRequired
                password_last_set = if ($_.PasswordLastSet) { $_.PasswordLastSet.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
                user_may_change_password = $_.UserMayChangePassword
                description = $_.Description
                sid = [string]$_.SID
            }
        }
} catch {}

$localGroups = @()
if ($IncludeLocalGroups) {
    try {
        $localGroups = Get-LocalGroup |
            ForEach-Object {
                [ordered]@{
                    name = $_.Name
                    description = $_.Description
                    sid = [string]$_.SID
                }
            }
    } catch {}
}

$localAdministrators = @()
try {
    $localAdministrators = Get-LocalGroupMember -Group Administrators |
        ForEach-Object {
            [ordered]@{
                name = $_.Name
                object_class = $_.ObjectClass
                principal_source = $_.PrincipalSource
                sid = [string]$_.SID
            }
        }
} catch {}

$usbDevices = @()
if ($IncludeUsb) {
    try {
        $usbDevices = Get-PnpDevice -Class USB -PresentOnly |
            Select-Object -First 100 |
            ForEach-Object {
                [ordered]@{
                    friendly_name = $_.FriendlyName
                    instance_id = $_.InstanceId
                    status = $_.Status
                    class = $_.Class
                    manufacturer = $_.Manufacturer
                }
            }
    } catch {}
}

$monitors = @()
if ($IncludeMonitors) {
    try {
        $monitors = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID |
            ForEach-Object {
                [ordered]@{
                    manufacturer = Convert-EdidString $_.ManufacturerName
                    product_code = Convert-EdidString $_.ProductCodeID
                    serial_number = Convert-EdidString $_.SerialNumberID
                    user_friendly_name = Convert-EdidString $_.UserFriendlyName
                    active = $_.Active
                    instance_name = $_.InstanceName
                }
            }
    } catch {}
}

$recentSoftware = @()
if ($IncludeRecentSoftware) {
    try {
        $registryPaths = @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
        )

        $recentSoftware = foreach ($path in $registryPaths) {
            Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName } |
                ForEach-Object {
                    [ordered]@{
                        name = $_.DisplayName
                        version = $_.DisplayVersion
                        publisher = $_.Publisher
                        install_date = $_.InstallDate
                    }
                }
        }

        $recentSoftware = $recentSoftware |
            Group-Object name, version, publisher |
            ForEach-Object { $_.Group[0] } |
            Sort-Object name |
            Select-Object -First $SoftwareLimit
    } catch {}
}

[ordered]@{
    collection_mode = @{
        include_usb = $IncludeUsb
        include_monitors = $IncludeMonitors
        include_local_groups = $IncludeLocalGroups
        include_recent_software = $IncludeRecentSoftware
    }
    antivirus = @($antivirus)
    defender = $defender
    bitlocker = @($bitlocker)
    firewall = @($firewall)
    hotfixes = @($hotfixes)
    update_services = @($updateServices)
    local_users = @($localUsers)
    local_groups = @($localGroups)
    local_administrators = @($localAdministrators)
    usb_devices = @($usbDevices)
    monitors = @($monitors)
    recent_software = @($recentSoftware)
} | ConvertTo-Json -Depth 10
"""

    script = (
        script
        .replace("__HOTFIX_LIMIT__", str(hotfix_limit))
        .replace("__SOFTWARE_LIMIT__", str(software_limit))
        .replace("__INCLUDE_USB__", include_usb_ps)
        .replace("__INCLUDE_MONITORS__", include_monitors_ps)
        .replace("__INCLUDE_LOCAL_GROUPS__", include_local_groups_ps)
        .replace("__INCLUDE_RECENT_SOFTWARE__", include_recent_software_ps)
    )

    try:
        output = run_powershell(script, timeout=240)
        data = json.loads(output) if output else {}

        return CommandResult(
            success=True,
            output=_clean_json_value(data),
        )

    except Exception as exc:
        return CommandResult(
            success=False,
            output={
                "message": "Falha ao coletar inventário de segurança.",
                "error": str(exc),
            },
            error_code="COLLECT_SECURITY_INVENTORY_FAILED",
        )



_PB_ALLOWED_COMMANDS = {
    "collect_inventory",
    "list_printers",
    "list_printer_drivers",
    "discover_network_printers",
    "collect_diagnostics",
    "collect_processes",
    "collect_services",
    "collect_software_inventory",
    "collect_security_inventory",
    "restart_spooler",
    "clear_print_queue",
    "set_default_printer",
    "print_test_page",
    "remove_printer",
    "install_network_printer",
    "kill_process",
    "start_service",
    "stop_service",
    "restart_service",
    "reboot_machine",
    "shutdown_machine",
    "cancel_power_action",
    "update_agent",
}

_PB_DANGEROUS_PAYLOAD_KEYS = {
    "script",
    "powershell",
    "ps1",
    "cmd",
    "cmdline",
    "command",
    "command_line",
    "shell",
    "code",
    "raw",
    "bat",
    "exe",
}

_PB_DANGEROUS_TEXT_CHARS = {"`", "\"", "'", ";", "&", "|", "<", ">", "$"}


def _printerbridge_policy_error(message: str) -> CommandResult:
    return CommandResult(
        success=False,
        output=message,
        error_code="COMMAND_POLICY_VIOLATION",
    )


def _pb_scan_payload(value, path="payload"):
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key).strip().lower()
            if key_text in _PB_DANGEROUS_PAYLOAD_KEYS:
                raise ValueError(f"Payload field not allowed: {path}.{key}")
            _pb_scan_payload(item, f"{path}.{key}")

    elif isinstance(value, list):
        for index, item in enumerate(value):
            _pb_scan_payload(item, f"{path}[{index}]")


def _pb_check_payload_size(payload):
    import json

    try:
        encoded = json.dumps(payload, ensure_ascii=False)
    except TypeError:
        raise ValueError("Payload must be JSON serializable")

    if len(encoded.encode("utf-8")) > 20000:
        raise ValueError("Payload too large")


def _pb_safe_text(payload, field, required=False, max_len=256):
    value = payload.get(field)

    if value is None or value == "":
        if required:
            raise ValueError(f"Missing required field: {field}")
        return None

    if not isinstance(value, str):
        raise ValueError(f"Invalid field type: {field}")

    value = value.strip()

    if not value:
        if required:
            raise ValueError(f"Missing required field: {field}")
        return None

    if len(value) > max_len:
        raise ValueError(f"Field too long: {field}")

    if any(ord(ch) < 32 for ch in value):
        raise ValueError(f"Invalid control character in field: {field}")

    if any(ch in _PB_DANGEROUS_TEXT_CHARS for ch in value):
        raise ValueError(f"Unsafe character in field: {field}")

    return value


def _pb_safe_int(payload, field, required=False, minimum=0, maximum=65535):
    value = payload.get(field)

    if value is None or value == "":
        if required:
            raise ValueError(f"Missing required field: {field}")
        return None

    try:
        value_int = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid integer field: {field}")

    if value_int < minimum or value_int > maximum:
        raise ValueError(f"Field out of range: {field}")

    return value_int


def _pb_validate_ip(payload, field):
    import ipaddress

    value = payload.get(field)

    if not value or not isinstance(value, str):
        raise ValueError(f"Missing required field: {field}")

    try:
        ipaddress.ip_address(value.strip())
    except ValueError:
        raise ValueError(f"Invalid IP address: {field}")


def _pb_validate_network(payload, field):
    import ipaddress

    value = payload.get(field)

    if value is None or value == "":
        return

    if not isinstance(value, str):
        raise ValueError(f"Invalid network field: {field}")

    try:
        ipaddress.ip_network(value.strip(), strict=False)
    except ValueError:
        raise ValueError(f"Invalid network field: {field}")


def _pb_validate_install_network_printer(payload):
    install_method = str(payload.get("install_method") or "tcp_ip").strip().lower()

    if install_method not in {"tcp_ip", "smb_share"}:
        raise ValueError("Invalid install_method")

    _pb_safe_text(payload, "printer_name", required=True, max_len=128)
    _pb_safe_text(payload, "driver_name", required=False, max_len=256)
    _pb_safe_text(payload, "queue_name", required=False, max_len=128)

    if install_method == "smb_share":
        share_path = _pb_safe_text(payload, "share_path", required=True, max_len=260)
        if not share_path.startswith("\\\\"):
            raise ValueError("Invalid SMB share path")
        return

    _pb_validate_ip(payload, "ip")

    protocol = str(payload.get("protocol") or "tcp_9100").strip().lower()
    if protocol not in {"tcp_9100", "lpr_515"}:
        raise ValueError("Invalid printer protocol")

    port = _pb_safe_int(payload, "port", required=False, minimum=1, maximum=65535)

    if protocol == "tcp_9100" and port not in {None, 9100}:
        raise ValueError("Invalid port for tcp_9100")

    if protocol == "lpr_515":
        if port not in {None, 515}:
            raise ValueError("Invalid port for lpr_515")
        _pb_safe_text(payload, "queue_name", required=True, max_len=128)


def _printerbridge_policy_validate_command(command_type, payload):
    command_type = str(command_type or "").strip()
    payload = payload or {}

    try:
        if command_type not in _PB_ALLOWED_COMMANDS:
            raise ValueError(f"Unsupported command type: {command_type}")

        if not isinstance(payload, dict):
            raise ValueError("Payload must be an object")

        _pb_check_payload_size(payload)
        _pb_scan_payload(payload)

        if command_type == "discover_network_printers":
            _pb_validate_network(payload, "network")

        if command_type in {"set_default_printer", "print_test_page", "remove_printer", "clear_print_queue"}:
            _pb_safe_text(payload, "printer_name", required=True, max_len=128)

        if command_type == "install_network_printer":
            _pb_validate_install_network_printer(payload)

        if command_type in {"start_service", "stop_service", "restart_service"}:
            _pb_safe_text(payload, "service_name", required=True, max_len=128)

        if command_type == "kill_process":
            process_id = payload.get("process_id")
            process_name = payload.get("process_name")
            scope = _pb_safe_text(payload, "scope", required=False, max_len=32) or "single"

            if scope not in {"single", "tree", "all_by_name", "browser_root"}:
                raise ValueError("Invalid kill_process scope")

            if process_id in {None, ""} and process_name in {None, ""}:
                raise ValueError("Missing process_id or process_name")

            if scope in {"all_by_name", "browser_root"} and process_name in {None, ""}:
                raise ValueError("Missing process_name for selected scope")

            if process_id not in {None, ""}:
                _pb_safe_int(payload, "process_id", required=True, minimum=1, maximum=999999)

            if process_name not in {None, ""}:
                _pb_safe_text(payload, "process_name", required=True, max_len=128)

        if command_type in {"reboot_machine", "shutdown_machine"}:
            _pb_safe_int(payload, "delay_seconds", required=False, minimum=0, maximum=86400)
            _pb_safe_text(payload, "message", required=False, max_len=256)

        if command_type == "update_agent":
            _pb_safe_text(payload, "version", required=False, max_len=64)
            _pb_safe_text(payload, "release_id", required=False, max_len=128)
            _pb_safe_text(payload, "package_url", required=True, max_len=2048)
            sha256 = _pb_safe_text(payload, "sha256", required=True, max_len=64)

            import re

            if not re.fullmatch(r"[A-Fa-f0-9]{64}", sha256.strip()):
                raise ValueError("Invalid SHA256 field: sha256")

    except ValueError as exc:
        return _printerbridge_policy_error(str(exc))

    return None


def execute_command(command_type: str, payload: dict[str, Any]) -> CommandResult:
    policy_error = _printerbridge_policy_validate_command(command_type, payload or {})
    if policy_error is not None:
        return policy_error

    if command_type == "collect_software_inventory":
        return collect_software_inventory(payload)

    if command_type == "collect_security_inventory":
        return collect_security_inventory(payload)

    if command_type == "kill_process":
        return kill_process(payload)

    if command_type == "start_service":
        return start_service(payload)

    if command_type == "stop_service":
        return stop_service(payload)

    if command_type == "restart_service":
        return restart_service(payload)

    if command_type == "collect_processes":
        return collect_processes(payload)

    if command_type == "collect_services":
        return collect_services(payload)

    if command_type == "reboot_machine":
        return reboot_machine(payload)

    if command_type == "shutdown_machine":
        return shutdown_machine(payload)

    if command_type == "cancel_power_action":
        return cancel_power_action(payload)

    if command_type == "collect_diagnostics":
        return collect_diagnostics()

    if command_type == "update_agent":
        return update_agent(payload or {})
    try:

        if command_type == "list_printers":

            ps_script = r"""
$printers = Get-Printer | Select-Object Name, DriverName, PortName, ShareName, Published, Shared, PrinterStatus, WorkOffline
$printers | ConvertTo-Json -Depth 4
"""

            proc = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    ps_script,
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )

            if proc.returncode != 0:
                output = proc.stderr.strip() or proc.stdout.strip() or "Falha ao listar impressoras."
                return CommandResult(success=False, output=output)

            raw = proc.stdout.strip()
            data = json.loads(raw) if raw else []

            if isinstance(data, dict):
                data = [data]

            printers = []
            for item in data:
                printers.append(
                    {
                        "name": item.get("Name"),
                        "driver_name": item.get("DriverName"),
                        "port_name": item.get("PortName"),
                        "share_name": item.get("ShareName"),
                        "published": item.get("Published"),
                        "shared": item.get("Shared"),
                        "status": item.get("PrinterStatus"),
                        "work_offline": item.get("WorkOffline"),
                    }
                )

            result = {
                "status": "success",
                "total": len(printers),
                "items": printers,
            }

            return CommandResult(
                success=True,
                output="Impressoras locais encontradas: "
                + str(len(printers))
                + "\n\n"
                + json.dumps(result, ensure_ascii=False, indent=2),
            )

        if command_type == "discover_network_printers":
            discovery = discover_network_printers(payload or {})
            total = discovery.get("total", 0)
            output = json.dumps(_clean_json_value(discovery), ensure_ascii=False, indent=2)

            return CommandResult(
                success=True,
                output=f"Descoberta de impressoras concluída. Encontradas: {total}\n\n{output}",
            )

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

        if command_type == "install_network_printer":
            import json
            import os
            import subprocess
            import tempfile
            from pathlib import Path

            payload = payload or {}

            ps_payload = {
                "printer_name": payload.get("printer_name") or payload.get("name") or payload.get("ip") or "Impressora de rede",
                "install_method": str(payload.get("install_method") or "").lower(),
                "share_path": payload.get("share_path"),
                "ip": payload.get("ip"),
                "driver_name": payload.get("driver_name"),
                "protocol": str(payload.get("protocol") or "").lower(),
                "port": payload.get("port") or payload.get("port_number"),
                "port_name": payload.get("port_name"),
                "queue_name": payload.get("queue_name") or payload.get("lpr_queue_name"),
            }

            ps_script = r'''
        $ErrorActionPreference = "Stop"

        function Write-Result($obj) {
            $obj | ConvertTo-Json -Depth 8 -Compress
        }

        function Get-DriverList {
            try {
                return @(Get-PrinterDriver | Select-Object -ExpandProperty Name | Sort-Object)
            } catch {
                return @()
            }
        }

        try {
            $payloadPath = $env:GABRIEL_INSTALL_PRINTER_PAYLOAD
            $payload = Get-Content $payloadPath -Raw | ConvertFrom-Json

            $printerName = [string]$payload.printer_name
            $installMethod = [string]$payload.install_method
            $sharePath = [string]$payload.share_path
            $ip = [string]$payload.ip
            $driverName = [string]$payload.driver_name
            $protocol = [string]$payload.protocol
            $portValue = $payload.port
            $portName = [string]$payload.port_name
            $queueName = [string]$payload.queue_name

            if ([string]::IsNullOrWhiteSpace($printerName)) {
                $printerName = "Impressora de rede"
            }

            if (-not [string]::IsNullOrWhiteSpace($sharePath)) {
                $installMethod = "smb_share"
            }

            if ([string]::IsNullOrWhiteSpace($installMethod)) {
                $installMethod = "tcp_ip"
            }

            if ($installMethod -eq "smb_share") {
                if ([string]::IsNullOrWhiteSpace($sharePath) -or -not $sharePath.StartsWith("\\")) {
                    Write-Result @{
                        status = "invalid_payload"
                        message = "Caminho de compartilhamento inválido. Informe algo como \\SERVIDOR\IMPRESSORA."
                        printer_name = $printerName
                        share_path = $sharePath
                    }
                    exit 2
                }

                $existing = Get-Printer -ErrorAction SilentlyContinue | Where-Object {
                    $_.Name -eq $sharePath -or $_.Name -eq $printerName
                }

                if ($existing) {
                    Write-Result @{
                        status = "already_installed"
                        message = "Impressora compartilhada já está instalada."
                        printer_name = $existing.Name
                        share_path = $sharePath
                    }
                    exit 0
                }

                Add-Printer -ConnectionName $sharePath

                Write-Result @{
                    status = "installed"
                    install_method = "smb_share"
                    printer_name = $printerName
                    share_path = $sharePath
                }
                exit 0
            }

            if ([string]::IsNullOrWhiteSpace($ip)) {
                Write-Result @{
                    status = "invalid_payload"
                    message = "IP da impressora não informado."
                    printer_name = $printerName
                }
                exit 2
            }

            if ([string]::IsNullOrWhiteSpace($driverName)) {
                Write-Result @{
                    status = "needs_driver"
                    message = "Driver não informado. Escolha um driver instalado no Windows de destino antes de instalar."
                    printer_name = $printerName
                    ip = $ip
                    protocol = $protocol
                    port = $portValue
                    available_drivers = Get-DriverList
                }
                exit 3
            }

            $driverExists = Get-PrinterDriver -Name $driverName -ErrorAction SilentlyContinue

            if (-not $driverExists) {
                Write-Result @{
                    status = "driver_not_found"
                    message = "Driver informado não está instalado no Windows de destino."
                    printer_name = $printerName
                    requested_driver = $driverName
                    available_drivers = Get-DriverList
                }
                exit 4
            }

            $isLpr = $false

            if ($protocol -eq "lpr_515" -or "$portValue" -eq "515") {
                $isLpr = $true
            }

            if ($isLpr -and [string]::IsNullOrWhiteSpace($queueName)) {
                Write-Result @{
                    status = "needs_lpr_queue"
                    message = "A impressora usa LPR/515, mas a fila LPR não foi informada. Informe queue_name antes de instalar."
                    printer_name = $printerName
                    ip = $ip
                    protocol = "lpr_515"
                    port = 515
                    driver_name = $driverName
                }
                exit 5
            }

            if ([string]::IsNullOrWhiteSpace($portName)) {
                $safeIp = $ip.Replace(".", "_")

                if ($isLpr) {
                    $safeQueue = $queueName.Replace('\', '_').Replace('/', '_').Replace(' ', '_')
                    $portName = "LPR_${safeIp}_${safeQueue}"
                } else {
                    $portName = "IP_$safeIp"
                }
            }

            $existingPrinter = Get-Printer -Name $printerName -ErrorAction SilentlyContinue

            if ($existingPrinter) {
                Write-Result @{
                    status = "already_installed"
                    message = "Já existe uma impressora com esse nome."
                    printer_name = $printerName
                    port_name = $existingPrinter.PortName
                    driver_name = $existingPrinter.DriverName
                }
                exit 0
            }

            $existingPort = Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue

            if (-not $existingPort) {
                if ($isLpr) {
                    Add-PrinterPort -Name $portName -LprHostAddress $ip -LprQueueName $queueName -LprByteCounting
                } else {
                    $tcpPort = 9100

                    if ($portValue) {
                        try {
                            $tcpPort = [int]$portValue
                        } catch {
                            $tcpPort = 9100
                        }
                    }

                    Add-PrinterPort -Name $portName -PrinterHostAddress $ip -PortNumber $tcpPort
                }
            }

            Add-Printer -Name $printerName -DriverName $driverName -PortName $portName

            Write-Result @{
                status = "installed"
                install_method = $(if ($isLpr) { "lpr" } else { "tcp_ip" })
                printer_name = $printerName
                ip = $ip
                port_name = $portName
                driver_name = $driverName
                protocol = $(if ($isLpr) { "lpr_515" } else { "tcp_9100" })
                port = $(if ($isLpr) { 515 } else { $tcpPort })
                queue_name = $queueName
            }
            exit 0
        } catch {
            Write-Result @{
                status = "powershell_error"
                message = $_.Exception.Message
                category = $_.CategoryInfo.Category
                target = $_.CategoryInfo.TargetName
            }
            exit 10
        }
        '''

            with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json", encoding="utf-8") as temp_payload:
                json.dump(ps_payload, temp_payload, ensure_ascii=False)
                temp_payload_path = temp_payload.name

            try:
                env = dict(os.environ)
                env["GABRIEL_INSTALL_PRINTER_PAYLOAD"] = temp_payload_path

                proc = subprocess.run(
                    [
                        "powershell.exe",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        ps_script,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=int(payload.get("timeout_seconds") or 180),
                    env=env,
                )
            finally:
                try:
                    Path(temp_payload_path).unlink(missing_ok=True)
                except Exception:
                    pass

            raw_output = (proc.stdout or "").strip()
            raw_error = (proc.stderr or "").strip()

            if raw_output:
                try:
                    result = json.loads(raw_output.splitlines()[-1])
                except Exception:
                    result = {
                        "status": "unknown_output",
                        "raw_output": raw_output,
                        "raw_error": raw_error,
                    }
            else:
                result = {
                    "status": "powershell_error",
                    "message": raw_error or "PowerShell não retornou saída.",
                }

            status_value = str(result.get("status") or "").lower()

            output = (
                "Resultado da instalação de impressora de rede:\n\n"
                + json.dumps(result, ensure_ascii=False, indent=2)
            )

            if proc.returncode == 0 and status_value in {"installed", "already_installed"}:
                return CommandResult(success=True, output=output)

            return CommandResult(
                success=False,
                output=output,
                error_code=status_value or "install_network_printer_failed",
            )

        if command_type == "list_printer_drivers":
            import json
            import subprocess

            try:
                proc = subprocess.run(
                    [
                        "powershell.exe",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        "Get-PrinterDriver | Select-Object -ExpandProperty Name | Sort-Object -Unique | ConvertTo-Json -Compress",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )

                raw_output = (proc.stdout or "").strip()
                raw_error = (proc.stderr or "").strip()

                if proc.returncode != 0:
                    result = {
                        "status": "powershell_error",
                        "message": raw_error or "Falha ao listar drivers de impressora.",
                    }

                    return CommandResult(
                        success=False,
                        output=json.dumps(result, ensure_ascii=False, indent=2),
                        error_code="list_printer_drivers_failed",
                    )

                drivers = []

                if raw_output:
                    try:
                        parsed = json.loads(raw_output)
                        drivers = parsed if isinstance(parsed, list) else [parsed]
                    except Exception:
                        drivers = raw_output.splitlines()

                result = {
                    "status": "success",
                    "total": len(drivers),
                    "drivers": drivers,
                }

                return CommandResult(
                    success=True,
                    output=json.dumps(result, ensure_ascii=False, indent=2),
                )

            except Exception as exc:
                result = {
                    "status": "error",
                    "message": str(exc),
                }

                return CommandResult(
                    success=False,
                    output=json.dumps(result, ensure_ascii=False, indent=2),
                    error_code="list_printer_drivers_error",
                )

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
