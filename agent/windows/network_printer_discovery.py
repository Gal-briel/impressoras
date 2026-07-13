from __future__ import annotations

import concurrent.futures
import datetime as dt
import ipaddress
import json
import platform
import socket
import subprocess
import uuid
from typing import Any


DEFAULT_PORTS = [9100, 631, 515]
HTTP_PROBE_PORTS = [80, 443]


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _is_windows() -> bool:
    return platform.system().lower() == "windows"


def _run_powershell_json(script: str, timeout: int = 20) -> list[dict[str, Any]]:
    if not _is_windows():
        return []

    completed = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )

    if completed.returncode != 0 or not completed.stdout.strip():
        return []

    try:
        data = json.loads(completed.stdout)
    except Exception:
        return []

    if isinstance(data, dict):
        return [data]

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    return []


def _safe_reverse_dns(ip: str) -> str | None:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


def _try_tcp(ip: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except Exception:
        return False


def _probe_http_title(ip: str, port: int, timeout: float) -> str | None:
    if port not in (80, 443):
        return None

    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            request = b"GET / HTTP/1.0\r\nHost: printer\r\nUser-Agent: Gabriel-Agent\r\n\r\n"
            sock.sendall(request)
            raw = sock.recv(2048).decode("utf-8", errors="ignore").lower()
    except Exception:
        return None

    if "<title>" in raw and "</title>" in raw:
        title = raw.split("<title>", 1)[1].split("</title>", 1)[0].strip()
        return title[:120] or None

    return None


def _confidence_from_ports(open_ports: list[int], hostname: str | None, title: str | None) -> str:
    strong_ports = {9100, 631, 515}

    if strong_ports.intersection(open_ports):
        return "high"

    hints = " ".join([hostname or "", title or ""]).lower()
    printer_words = ["printer", "impressora", "hp", "canon", "brother", "epson", "ricoh", "kyocera", "xerox", "lexmark"]

    if any(word in hints for word in printer_words):
        return "medium"

    return "low"


def _device_name(ip: str, hostname: str | None, title: str | None) -> str:
    if hostname:
        return hostname

    if title:
        return title

    return f"Dispositivo {ip}"


def _local_networks_from_windows(max_hosts_per_subnet: int) -> list[dict[str, Any]]:
    script = r"""
$items = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and
    $_.IPAddress -notlike '169.254*' -and
    $_.PrefixLength -le 30
  } |
  Select-Object IPAddress,PrefixLength,InterfaceAlias

$items | ConvertTo-Json -Depth 4
"""

    raw_items = _run_powershell_json(script)
    networks: list[dict[str, Any]] = []

    for item in raw_items:
        ip = item.get("IPAddress")
        prefix = item.get("PrefixLength")
        interface = item.get("InterfaceAlias")

        if not ip or prefix is None:
            continue

        try:
            prefix_int = int(prefix)
            # Segurança: se a rede for muito grande, limita ao /24 daquele IP.
            effective_prefix = max(prefix_int, 24)
            network = ipaddress.ip_network(f"{ip}/{effective_prefix}", strict=False)
        except Exception:
            continue

        hosts_count = max(network.num_addresses - 2, 0)
        if hosts_count > max_hosts_per_subnet:
            network = ipaddress.ip_network(f"{ip}/24", strict=False)

        networks.append(
            {
                "network": str(network),
                "interface": interface,
                "source_ip": ip,
                "source": "windows",
            }
        )

    return networks


def _local_networks_fallback() -> list[dict[str, Any]]:
    networks: list[dict[str, Any]] = []

    try:
        hostname = socket.gethostname()
        ips = socket.gethostbyname_ex(hostname)[2]
    except Exception:
        ips = []

    for ip in ips:
        if ip.startswith("127.") or ip.startswith("169.254."):
            continue

        try:
            network = ipaddress.ip_network(f"{ip}/24", strict=False)
        except Exception:
            continue

        networks.append(
            {
                "network": str(network),
                "interface": None,
                "source_ip": ip,
                "source": "fallback",
            }
        )

    return networks


def _resolve_networks(payload: dict[str, Any], max_hosts_per_subnet: int) -> list[dict[str, Any]]:
    requested = payload.get("subnets") or payload.get("networks")

    if requested:
        networks: list[dict[str, Any]] = []

        for item in requested:
            try:
                network = ipaddress.ip_network(str(item), strict=False)
            except Exception:
                continue

            if network.version != 4:
                continue

            if network.num_addresses > max_hosts_per_subnet + 2:
                continue

            networks.append(
                {
                    "network": str(network),
                    "interface": None,
                    "source_ip": None,
                    "source": "payload",
                }
            )

        return networks

    networks = _local_networks_from_windows(max_hosts_per_subnet)
    if networks:
        return networks

    return _local_networks_fallback()


def _scan_ip(ip: str, ports: list[int], timeout: float, include_http_probe: bool) -> dict[str, Any] | None:
    open_ports: list[int] = []

    for port in ports:
        if _try_tcp(ip, port, timeout):
            open_ports.append(port)

    if not open_ports:
        return None

    hostname = _safe_reverse_dns(ip)
    title = None

    if include_http_probe:
        for port in open_ports:
            title = _probe_http_title(ip, port, timeout)
            if title:
                break

    confidence = _confidence_from_ports(open_ports, hostname, title)

    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"tcp-printer-{ip}-{','.join(map(str, open_ports))}")),
        "source": "tcp_scan",
        "type": "network_device",
        "install_method": "tcp_ip",
        "name": _device_name(ip, hostname, title),
        "ip": ip,
        "hostname": hostname,
        "share_path": None,
        "protocols": _protocols_from_ports(open_ports),
        "open_ports": open_ports,
        "driver_name": None,
        "driver_hint": None,
        "location": None,
        "description": title,
        "confidence": confidence,
    }


def _protocols_from_ports(ports: list[int]) -> list[str]:
    protocols = []

    if 9100 in ports:
        protocols.append("jetdirect_9100")

    if 631 in ports:
        protocols.append("ipp_631")

    if 515 in ports:
        protocols.append("lpr_515")

    if 80 in ports:
        protocols.append("http_80")

    if 443 in ports:
        protocols.append("https_443")

    return protocols


def _discover_ad_shared_printers() -> list[dict[str, Any]]:
    script = r"""
try {
  $searcher = New-Object DirectoryServices.DirectorySearcher
  $searcher.Filter = "(objectCategory=printQueue)"
  $searcher.PageSize = 100
  [void]$searcher.PropertiesToLoad.Add("printerName")
  [void]$searcher.PropertiesToLoad.Add("serverName")
  [void]$searcher.PropertiesToLoad.Add("uNCName")
  [void]$searcher.PropertiesToLoad.Add("driverName")
  [void]$searcher.PropertiesToLoad.Add("location")
  [void]$searcher.PropertiesToLoad.Add("description")

  $searcher.FindAll() | ForEach-Object {
    $p = $_.Properties

    [PSCustomObject]@{
      printerName = if ($p.printername) { [string]$p.printername[0] } else { $null }
      serverName = if ($p.servername) { [string]$p.servername[0] } else { $null }
      uncName = if ($p.uncname) { [string]$p.uncname[0] } else { $null }
      driverName = if ($p.drivername) { [string]$p.drivername[0] } else { $null }
      location = if ($p.location) { [string]$p.location[0] } else { $null }
      description = if ($p.description) { [string]$p.description[0] } else { $null }
    }
  } | ConvertTo-Json -Depth 4
} catch {
  @() | ConvertTo-Json
}
"""

    raw_items = _run_powershell_json(script, timeout=30)
    items: list[dict[str, Any]] = []

    for item in raw_items:
        share_path = item.get("uncName")
        name = item.get("printerName") or share_path

        if not share_path:
            continue

        items.append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"smb-printer-{share_path.lower()}")),
                "source": "active_directory",
                "type": "shared_printer",
                "install_method": "smb_share",
                "name": name,
                "ip": None,
                "hostname": item.get("serverName"),
                "share_path": share_path,
                "protocols": ["smb"],
                "open_ports": [],
                "driver_name": item.get("driverName"),
                "driver_hint": item.get("driverName"),
                "location": item.get("location"),
                "description": item.get("description"),
                "confidence": "high",
            }
        )

    return items


def discover_network_printers(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}

    started_at = _utc_now()
    warnings: list[str] = []

    timeout = float(payload.get("timeout_seconds", 0.35))
    max_workers = int(payload.get("max_workers", 96))
    max_hosts_per_subnet = int(payload.get("max_hosts_per_subnet", 254))
    include_http_probe = bool(payload.get("include_http_probe", False))

    ports = payload.get("ports") or DEFAULT_PORTS

    if payload.get("include_http_ports"):
        ports = list(dict.fromkeys([*ports, *HTTP_PROBE_PORTS]))

    ports = [int(port) for port in ports if int(port) > 0 and int(port) <= 65535]

    networks = _resolve_networks(payload, max_hosts_per_subnet=max_hosts_per_subnet)

    if not networks:
        warnings.append("Nenhuma sub-rede local IPv4 foi identificada.")

    items: list[dict[str, Any]] = []

    # 1. Impressoras compartilhadas publicadas no AD.
    try:
        items.extend(_discover_ad_shared_printers())
    except Exception as exc:
        warnings.append(f"Falha ao consultar impressoras compartilhadas no AD: {exc}")

    # 2. Scan TCP nas sub-redes locais.
    scan_ips: list[str] = []

    for network_item in networks:
        try:
            network = ipaddress.ip_network(network_item["network"], strict=False)
        except Exception:
            continue

        hosts = list(network.hosts())

        if len(hosts) > max_hosts_per_subnet:
            warnings.append(f"Rede {network} ignorada por exceder limite de {max_hosts_per_subnet} hosts.")
            continue

        scan_ips.extend(str(host) for host in hosts)

    scan_ips = sorted(set(scan_ips))

    if scan_ips:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(_scan_ip, ip, ports, timeout, include_http_probe)
                for ip in scan_ips
            ]

            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    items.append(result)

    # Remove duplicados por share_path ou IP.
    unique: dict[str, dict[str, Any]] = {}

    for item in items:
        key = item.get("share_path") or item.get("ip") or item.get("id")
        unique[str(key).lower()] = item

    final_items = sorted(
        unique.values(),
        key=lambda item: (
            {"high": 0, "medium": 1, "low": 2}.get(item.get("confidence"), 3),
            item.get("name") or "",
        ),
    )

    return {
        "status": "success",
        "started_at": started_at,
        "completed_at": _utc_now(),
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "networks": networks,
        "scan": {
            "ports": ports,
            "timeout_seconds": timeout,
            "max_workers": max_workers,
            "max_hosts_per_subnet": max_hosts_per_subnet,
            "include_http_probe": include_http_probe,
            "total_ips_scanned": len(scan_ips),
        },
        "total": len(final_items),
        "items": final_items,
        "warnings": warnings,
    }


if __name__ == "__main__":
    result = discover_network_printers(
        {
            "max_hosts_per_subnet": 16,
            "timeout_seconds": 0.15,
            "max_workers": 16,
        }
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
