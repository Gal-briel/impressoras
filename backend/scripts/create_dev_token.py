"""Gera um JWT de desenvolvimento para testar rotas administrativas no Swagger.

Uso:
    cd backend
    python scripts/create_dev_token.py <tenant_uuid> <user_uuid>
"""
import sys

from app.core.security import create_access_token

DEFAULT_PERMISSIONS = [
    "agents:read",
    "agents:write",
    "commands:execute",
    "agent-tags:write",
    "agent-groups:write",
]

if len(sys.argv) != 3:
    raise SystemExit("Uso: python scripts/create_dev_token.py <tenant_uuid> <user_uuid>")

print(create_access_token(sys.argv[2], sys.argv[1], DEFAULT_PERMISSIONS))
