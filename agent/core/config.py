# agent/core/config.py
import json
import os
from dataclasses import dataclass, fields
from pathlib import Path

from agent.version import AGENT_VERSION


@dataclass
class AgentConfig:
    tenant_id: str
    agent_id: str
    api_key: str
    api_url: str
    ws_url: str
    version: str = AGENT_VERSION
    data_dir: Path = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SaaS_Agent"

    update_enabled: bool = True
    update_channel: str = "stable"
    update_check_interval_seconds: int = 3600
    update_download_timeout_seconds: int = 300
    update_health_timeout_seconds: int = 90
    update_service_name: str = "SaaSAgent"

    watchdog_enabled: bool = True
    watchdog_timeout_seconds: int = 120
    watchdog_check_interval_seconds: int = 10
    watchdog_pulse_interval_seconds: int = 10
    watchdog_restart_cooldown_seconds: int = 300

    @classmethod
    def load(cls) -> "AgentConfig":
        config_path = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SaaS_Agent" / "config.json"
        if not config_path.exists():
            raise FileNotFoundError("Configuration file not found. Agent must be enrolled first.")
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = AGENT_VERSION
        allowed_fields = {field.name for field in fields(cls)}
        filtered_data = {key: value for key, value in data.items() if key in allowed_fields}
        return cls(**filtered_data, data_dir=config_path.parent)


config = AgentConfig.load()
