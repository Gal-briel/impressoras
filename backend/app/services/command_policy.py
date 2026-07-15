import ipaddress
import json

from app.core.config import settings
from typing import Any, Iterable, Mapping


class CommandPolicyViolation(ValueError):
    pass


class CommandPermissionDenied(PermissionError):
    pass


READ_COMMANDS = {
    "collect_inventory",
    "list_printers",
    "list_printer_drivers",
    "discover_network_printers",
    "collect_diagnostics",
    "collect_processes",
    "collect_services",
    "collect_software_inventory",
    "collect_security_inventory",
}

PRINTER_WRITE_COMMANDS = {
    "restart_spooler",
    "clear_print_queue",
    "set_default_printer",
    "print_test_page",
    "remove_printer",
    "install_network_printer",
}

SYSTEM_COMMANDS = {
    "kill_process",
    "start_service",
    "stop_service",
    "restart_service",
    "reboot_machine",
    "shutdown_machine",
    "cancel_power_action",
    "update_agent",
}

ALLOWED_COMMANDS = READ_COMMANDS | PRINTER_WRITE_COMMANDS | SYSTEM_COMMANDS

COMMAND_REQUIRED_PERMISSION = {
    **{command: "commands:execute" for command in READ_COMMANDS},
    **{command: "printers:write" for command in PRINTER_WRITE_COMMANDS},
    **{command: "commands:system" for command in SYSTEM_COMMANDS},
}

DANGEROUS_PAYLOAD_KEYS = {
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

DANGEROUS_TEXT_CHARS = set("`\"';&|<>$")


def _permission_aliases(permission: str) -> set[str]:
    return {
        permission,
        permission.replace(":", "."),
        permission.replace(".", ":"),
    }


def _has_permission(permissions: Iterable[str], required: str) -> bool:
    granted = set(permissions or [])
    return bool(_permission_aliases(required) & granted)


def _scan_for_dangerous_payload_keys(value: Any, path: str = "payload") -> None:
    if isinstance(value, Mapping):
        for key, item in value.items():
            key_text = str(key).strip().lower()
            if key_text in DANGEROUS_PAYLOAD_KEYS:
                raise CommandPolicyViolation(f"Payload field not allowed: {path}.{key}")
            _scan_for_dangerous_payload_keys(item, f"{path}.{key}")

    elif isinstance(value, list):
        for index, item in enumerate(value):
            _scan_for_dangerous_payload_keys(item, f"{path}[{index}]")


def _ensure_payload_size(payload: Mapping[str, Any]) -> None:
    try:
        encoded = json.dumps(payload, ensure_ascii=False)
    except TypeError:
        raise CommandPolicyViolation("Payload must be JSON serializable")

    if len(encoded.encode("utf-8")) > 20000:
        raise CommandPolicyViolation("Payload too large")


def _safe_text(
    payload: Mapping[str, Any],
    field: str,
    *,
    required: bool = False,
    max_len: int = 256,
) -> str | None:
    value = payload.get(field)

    if value is None or value == "":
        if required:
            raise CommandPolicyViolation(f"Missing required field: {field}")
        return None

    if not isinstance(value, str):
        raise CommandPolicyViolation(f"Invalid field type: {field}")

    value = value.strip()

    if not value:
        if required:
            raise CommandPolicyViolation(f"Missing required field: {field}")
        return None

    if len(value) > max_len:
        raise CommandPolicyViolation(f"Field too long: {field}")

    if any(ord(ch) < 32 for ch in value):
        raise CommandPolicyViolation(f"Invalid control character in field: {field}")

    if any(ch in DANGEROUS_TEXT_CHARS for ch in value):
        raise CommandPolicyViolation(f"Unsafe character in field: {field}")

    return value


def _safe_int(
    payload: Mapping[str, Any],
    field: str,
    *,
    required: bool = False,
    minimum: int = 0,
    maximum: int = 65535,
) -> int | None:
    value = payload.get(field)

    if value is None or value == "":
        if required:
            raise CommandPolicyViolation(f"Missing required field: {field}")
        return None

    try:
        value_int = int(value)
    except (TypeError, ValueError):
        raise CommandPolicyViolation(f"Invalid integer field: {field}")

    if value_int < minimum or value_int > maximum:
        raise CommandPolicyViolation(f"Field out of range: {field}")

    return value_int


def _validate_ip(value: Any, field: str) -> None:
    if not value or not isinstance(value, str):
        raise CommandPolicyViolation(f"Missing required field: {field}")

    try:
        ipaddress.ip_address(value.strip())
    except ValueError:
        raise CommandPolicyViolation(f"Invalid IP address: {field}")


def _validate_network(value: Any, field: str) -> None:
    if value is None or value == "":
        return

    if not isinstance(value, str):
        raise CommandPolicyViolation(f"Invalid network field: {field}")

    try:
        ipaddress.ip_network(value.strip(), strict=False)
    except ValueError:
        raise CommandPolicyViolation(f"Invalid network field: {field}")


def _validate_install_network_printer(payload: Mapping[str, Any]) -> None:
    install_method = str(payload.get("install_method") or "tcp_ip").strip().lower()

    if install_method not in {"tcp_ip", "smb_share"}:
        raise CommandPolicyViolation("Invalid install_method")

    _safe_text(payload, "printer_name", required=True, max_len=128)
    _safe_text(payload, "driver_name", required=False, max_len=256)
    _safe_text(payload, "queue_name", required=False, max_len=128)

    if install_method == "smb_share":
        share_path = _safe_text(payload, "share_path", required=True, max_len=260)
        if not share_path.startswith("\\\\"):
            raise CommandPolicyViolation("Invalid SMB share path")
        return

    _validate_ip(payload.get("ip"), "ip")

    protocol = str(payload.get("protocol") or "tcp_9100").strip().lower()
    if protocol not in {"tcp_9100", "lpr_515"}:
        raise CommandPolicyViolation("Invalid printer protocol")

    port = _safe_int(payload, "port", required=False, minimum=1, maximum=65535)

    if protocol == "tcp_9100" and port not in {None, 9100}:
        raise CommandPolicyViolation("Invalid port for tcp_9100")

    if protocol == "lpr_515":
        if port not in {None, 515}:
            raise CommandPolicyViolation("Invalid port for lpr_515")
        _safe_text(payload, "queue_name", required=True, max_len=128)


def _validate_printer_payload(command_type: str, payload: Mapping[str, Any]) -> None:
    if command_type in {"set_default_printer", "print_test_page", "remove_printer", "clear_print_queue"}:
        _safe_text(payload, "printer_name", required=True, max_len=128)

    if command_type == "install_network_printer":
        _validate_install_network_printer(payload)



def _validate_sha256(value: str | None, field: str = "sha256") -> None:
    import re

    if not isinstance(value, str):
        raise CommandPolicyViolation(f"Invalid field type: {field}")

    normalized = value.strip()

    if not re.fullmatch(r"[A-Fa-f0-9]{64}", normalized):
        raise CommandPolicyViolation(f"Invalid SHA256 field: {field}")


def _validate_agent_package_url(package_url: str | None) -> None:
    from urllib.parse import urlparse

    if not isinstance(package_url, str):
        raise CommandPolicyViolation("Invalid field type: package_url")

    normalized = package_url.strip()

    if not normalized:
        raise CommandPolicyViolation("Missing required field: package_url")

    parsed = urlparse(normalized)
    host = (parsed.hostname or "").lower()

    if parsed.scheme not in {"http", "https"} or not host:
        raise CommandPolicyViolation("Invalid package_url")

    allowed_hosts = {
        item.strip().lower()
        for item in str(getattr(settings, "AGENT_PACKAGE_ALLOWED_HOSTS", "") or "").split(",")
        if item.strip()
    }

    if allowed_hosts and host not in allowed_hosts:
        raise CommandPolicyViolation("package_url host is not allowed")

    if parsed.scheme != "https" and host not in {"localhost", "127.0.0.1", "::1"}:
        raise CommandPolicyViolation("package_url must use HTTPS")

    if parsed.query or parsed.fragment:
        raise CommandPolicyViolation("package_url cannot include query string or fragment")

    if not parsed.path.startswith("/agent-packages/"):
        raise CommandPolicyViolation("package_url must point to /agent-packages/")

    if not parsed.path.lower().endswith(".zip"):
        raise CommandPolicyViolation("package_url must point to a .zip package")


def _validate_system_payload(command_type: str, payload: Mapping[str, Any]) -> None:
    if command_type in {"start_service", "stop_service", "restart_service"}:
        _safe_text(payload, "service_name", required=True, max_len=128)

    if command_type == "kill_process":
        process_id = payload.get("process_id")
        process_name = payload.get("process_name")
        scope = _safe_text(payload, "scope", required=False, max_len=32) or "single"

        if scope not in {"single", "tree", "all_by_name", "browser_root"}:
            raise CommandPolicyViolation("Invalid kill_process scope")

        if process_id in {None, ""} and process_name in {None, ""}:
            raise CommandPolicyViolation("Missing process_id or process_name")

        if scope in {"all_by_name", "browser_root"} and process_name in {None, ""}:
            raise CommandPolicyViolation("Missing process_name for selected scope")

        if process_id not in {None, ""}:
            _safe_int(payload, "process_id", required=True, minimum=1, maximum=999999)

        if process_name not in {None, ""}:
            _safe_text(payload, "process_name", required=True, max_len=128)

    if command_type in {"reboot_machine", "shutdown_machine"}:
        _safe_int(payload, "delay_seconds", required=False, minimum=0, maximum=86400)
        _safe_text(payload, "message", required=False, max_len=256)

    if command_type == "update_agent":
        _safe_text(payload, "version", required=False, max_len=64)
        _safe_text(payload, "release_id", required=False, max_len=128)
        package_url = _safe_text(payload, "package_url", required=True, max_len=2048)
        sha256 = _safe_text(payload, "sha256", required=True, max_len=64)
        _validate_agent_package_url(package_url)
        _validate_sha256(sha256)


def _validate_read_payload(command_type: str, payload: Mapping[str, Any]) -> None:
    if command_type == "discover_network_printers":
        _validate_network(payload.get("network"), "network")


def validate_and_authorize_command(
    command_type: str,
    payload: Mapping[str, Any] | None,
    permissions: Iterable[str],
) -> None:
    command_type = str(command_type or "").strip()

    if command_type not in ALLOWED_COMMANDS:
        raise CommandPolicyViolation(f"Unsupported command type: {command_type}")

    payload = payload or {}

    if not isinstance(payload, Mapping):
        raise CommandPolicyViolation("Payload must be an object")

    _ensure_payload_size(payload)
    _scan_for_dangerous_payload_keys(payload)

    required_permission = COMMAND_REQUIRED_PERMISSION[command_type]
    if not _has_permission(permissions, required_permission):
        raise CommandPermissionDenied(f"Missing permission: {required_permission}")

    if command_type in READ_COMMANDS:
        _validate_read_payload(command_type, payload)

    if command_type in PRINTER_WRITE_COMMANDS:
        _validate_printer_payload(command_type, payload)

    if command_type in SYSTEM_COMMANDS:
        _validate_system_payload(command_type, payload)
