# agent/security/auth.py
from typing import Dict
from agent.core.config import config

class SecurityManager:
    @staticmethod
    def get_auth_headers() -> Dict[str, str]:
        return {
            "Authorization": f"ApiKey {config.api_key}",
            "X-Agent-ID": config.agent_id,
            "X-Tenant-ID": config.tenant_id,
            "X-Agent-Version": config.version
        }