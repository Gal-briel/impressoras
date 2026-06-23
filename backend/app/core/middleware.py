# backend/app/core/middleware.py

import re
import asyncio
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.infrastructure.database.models import AuditLog

class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Processa a requisição normalmente
        response = await call_next(request)
        
        # Ignora erros de validação inicial ou métodos de leitura (GET, OPTIONS)
        if response.status_code >= 400 or request.method not in ["POST", "PUT", "PATCH", "DELETE"]:
            return response

        path = request.url.path
        action = None
        target_type = None
        target_id = None

        # 2. Roteamento de ações auditáveis (Pattern Matching)
        if "/auth/login" in path and request.method == "POST":
            action = "user_login"
            target_type = "auth"
            target_id = "system"
        elif "/auth/logout" in path and request.method == "POST":
            action = "user_logout"
            target_type = "auth"
            target_id = "system"
        elif "/commands" in path and request.method == "POST":
            action = "command_created"
            target_type = "agent"
            match = re.search(r"/agents/([^/]+)/commands", path)
            if match:
                target_id = match.group(1)
        elif "/agents/" in path and request.method in ["PATCH", "PUT"]:
            action = "agent_altered"
            target_type = "agent"
            match = re.search(r"/agents/([^/]+)", path)
            if match:
                target_id = match.group(1)

        # 3. Dispara a gravação em background se a ação for monitorada
        if action:
            user_id, tenant_id = self._extract_identity(request)
            client_ip = request.client.host if request.client else "unknown"
            
            # Fire and forget para não bloquear o tempo de resposta da API
            asyncio.create_task(
                self._log_audit(tenant_id, user_id, action, target_type, target_id or "unknown", client_ip)
            )

        return response

    def _extract_identity(self, request: Request):
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                # Decode passivo (confiando que a rota já validou a assinatura se necessário)
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"verify_signature": False})
                return payload.get("sub"), payload.get("tenant_id")
            except Exception:
                pass
        return None, None

    async def _log_audit(self, tenant_id: str, user_id: str, action: str, target_type: str, target_id: str, ip: str):
        # A sessão local isolada garante que o commit não interfira na transação principal da requisição
        async with AsyncSessionLocal() as session:
            audit_log = AuditLog(
                tenant_id=tenant_id,
                user_id=user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                ip_address=ip,
                metadata_payload={}
            )
            session.add(audit_log)
            try:
                await session.commit()
            except Exception as e:
                # Tratar falha silenciosa ou direcionar para um agregador de logs (ex: Sentry)
                pass