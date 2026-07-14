from __future__ import annotations

import json
import requests
import uuid
import socket
import platform
import os
import logging
from logging.handlers import RotatingFileHandler
import sys
import time
from pathlib import Path
from typing import Any

from api_client import GabrielApiClient
from command_runner import execute_command
from printer_inventory import collect_printers


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOG_FILE = LOG_DIR / "agent.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        RotatingFileHandler(
            LOG_FILE,
            maxBytes=2_000_000,
            backupCount=5,
            encoding="utf-8-sig",
        ),
    ],
)


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Arquivo {CONFIG_PATH} não encontrado. Copie config.example.json para config.json e ajuste base_url/enrollment_token."
        )

    with CONFIG_PATH.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def save_config(config: dict[str, Any]) -> None:
    with CONFIG_PATH.open("w", encoding="utf-8") as file:
        json.dump(config, file, indent=2, ensure_ascii=False)
        file.write("\n")


def normalize_base_url(base_url: str) -> str:
    value = str(base_url or "").strip().rstrip("/")

    if not value:
        raise RuntimeError("base_url não configurado no config.json.")

    if not value.endswith("/api/v1"):
        value = value + "/api/v1"

    return value


def get_primary_mac() -> str:
    node = uuid.getnode()
    mac = ":".join(f"{(node >> shift) & 0xff:02x}" for shift in range(40, -1, -8))

    if mac == "00:00:00:00:00:00":
        raise RuntimeError("Não foi possível detectar o MAC address principal.")

    return mac


def get_internal_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return None


def get_domain_name() -> str | None:
    for key in ("USERDNSDOMAIN", "USERDOMAIN"):
        value = os.environ.get(key)

        if value:
            return value

    return None


def ensure_enrolled(config: dict[str, Any]) -> dict[str, Any]:
    config["base_url"] = normalize_base_url(config.get("base_url", ""))

    if config.get("agent_id") and config.get("api_key"):
        return config

    enrollment_token = str(config.get("enrollment_token") or "").strip()

    if not enrollment_token:
        raise RuntimeError(
            "Agente sem agent_id/api_key e sem enrollment_token. "
            "Reinstale usando um enrollment token válido."
        )

    agent_version = str(config.get("agent_version", "0.1.0"))

    payload = {
        "enrollment_token": enrollment_token,
        "hostname": socket.gethostname(),
        "mac_address": get_primary_mac(),
        "os_version": platform.platform(),
        "agent_version": agent_version,
        "internal_ip": get_internal_ip(),
        "domain_name": get_domain_name(),
        "capabilities": ["check_in", "commands", "printers"],
    }

    url = f"{config['base_url']}/agent/enroll"

    logging.info("Realizando enrollment seguro do agente em %s", url)

    response = requests.post(url, json=payload, timeout=30)

    if response.status_code >= 400:
        raise RuntimeError(
            f"Enrollment falhou com HTTP {response.status_code}: {response.text[:500]}"
        )

    data = response.json()
    agent_id = data.get("agent_id")
    api_key = data.get("api_key")

    if not agent_id or not api_key:
        raise RuntimeError("Enrollment não retornou agent_id/api_key.")

    config["agent_id"] = agent_id
    config["api_key"] = api_key
    config["enrolled_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    config.pop("enrollment_token", None)

    save_config(config)

    logging.info("Enrollment concluído. Agent ID: %s", agent_id)

    return config



def get_result_printers(result):
    if isinstance(result, dict):
        printers = result.get("printers")

        if isinstance(printers, dict):
            return printers.get("items")

        return printers

    return getattr(result, "printers", None)


def get_result_output(result):
    if isinstance(result, dict):
        return result

    if hasattr(result, "model_dump"):
        return result.model_dump()

    if hasattr(result, "dict"):
        return result.dict()

    if hasattr(result, "__dict__"):
        return result.__dict__

    return str(result)



def get_result_error_code(result):
    if isinstance(result, dict):
        return result.get("error_code")

    return getattr(result, "error_code", None)



def safe_result_printers(result):
    if isinstance(result, dict):
        printers = result.get("printers")

        if isinstance(printers, dict):
            return printers.get("items")

        return printers

    return getattr(result, "printers", None)


def safe_result_success(result):
    if isinstance(result, dict):
        status = str(result.get("status", "")).lower()

        if status in ("scheduled", "success", "ok"):
            return True

        if "success" in result:
            return bool(result.get("success"))

        return True

    return bool(getattr(result, "success", True))



def safe_result_output(result):
    if isinstance(result, dict):
        return json.dumps(result, ensure_ascii=False, default=str)

    if hasattr(result, "output"):
        value = getattr(result, "output")

        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, default=str)

        return value

    if hasattr(result, "model_dump"):
        return json.dumps(result.model_dump(), ensure_ascii=False, default=str)

    if hasattr(result, "dict"):
        return json.dumps(result.dict(), ensure_ascii=False, default=str)

    if hasattr(result, "__dict__"):
        return json.dumps(result.__dict__, ensure_ascii=False, default=str)

    return str(result)


def safe_result_error(result):
    if isinstance(result, dict):
        return result.get("error") or result.get("message")

    return getattr(result, "error", None)


def safe_result_error_code(result):
    if isinstance(result, dict):
        return result.get("error_code") or "COMMAND_FAILED"

    return getattr(result, "error_code", None) or "COMMAND_FAILED"


def process_command(client: GabrielApiClient, command: dict[str, Any]) -> None:
    command_id = command["id"]
    command_type = command["command_type"]
    payload = command.get("payload") or {}

    logging.info("Executando comando %s (%s)", command_id, command_type)

    client.update_command_status(command_id, "acknowledged")
    client.update_command_status(command_id, "executing")

    result = execute_command(command_type, payload)

    printers = get_result_printers(result)
    if printers is not None:
        inventory_response = client.send_printer_inventory(printers)
        logging.info("Inventário enviado: %s", inventory_response)

    if safe_result_success(result):
        client.update_command_status(
            command_id,
            "success",
            output=safe_result_output(result),
        )
        logging.info("Comando %s finalizado com sucesso.", command_id)
    else:
        client.update_command_status(
            command_id,
            "failed",
            output=safe_result_output(result),
            error_code=safe_result_error_code(result),
        )
        logging.warning("Comando %s falhou: %s", command_id, result.output)


def main() -> int:
    config = ensure_enrolled(load_config())

    client = GabrielApiClient(
        base_url=config["base_url"],
        agent_id=config["agent_id"],
        api_key=config["api_key"],
    )

    agent_version = config.get("agent_version", "0.1.0")
    poll_seconds = int(config.get("poll_seconds", 5))
    command_limit = int(config.get("command_limit", 5))

    logging.info("PrinterBridge Agent Windows iniciado.")
    logging.info("Agent ID: %s", config.get("agent_id"))
    logging.info("Backend: %s", config.get("base_url"))

    try:
        client.report_event("agent_started", "PrinterBridge Agent Windows iniciado.", "info")
    except Exception as exc:
        logging.warning("Não foi possível registrar evento inicial: %s", exc)

    try:
        printers = collect_printers()
        if printers:
            response = client.send_printer_inventory(printers)
            logging.info("Inventário inicial enviado: %s", response)
    except Exception as exc:
        logging.warning("Inventário inicial não enviado: %s", exc)

    while True:
        try:
            check_in = client.check_in(
                agent_version,
                hostname=socket.gethostname(),
                mac_address=get_primary_mac(),
                internal_ip=get_internal_ip(),
                domain_name=get_domain_name(),
            )
            logging.info("Check-in OK: %s", check_in)

            commands = client.get_pending_commands(limit=command_limit)

            if commands:
                logging.info("Comandos pendentes: %s", len(commands))

            for command in commands:
                process_command(client, command)

        except KeyboardInterrupt:
            logging.info("Agente interrompido pelo usuário.")
            return 0

        except Exception as exc:
            logging.exception("Erro no loop do agente: %s", exc)

        time.sleep(poll_seconds)


if __name__ == "__main__":
    sys.exit(main())
