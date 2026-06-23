# backend/app/services/agent_presence.py
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.domain.enums import AgentStatus
from app.core.redis import redis_client

class AgentPresenceService:
    """
    Serviço de domínio responsável por determinar o status de conectividade
    do agente com base no estado em tempo real (Redis) e no último heartbeat registrado (Fallback).
    """
    
    @staticmethod
    async def calculate_status(agent_id: UUID, last_seen: Optional[datetime]) -> AgentStatus:
        # 1. Verifica estado distribuído no Redis em tempo real (O(1))
        # Suporta múltiplas instâncias da aplicação consultando o mesmo estado
        if redis_client.client:
            is_online = await redis_client.client.exists(f"agent:presence:{str(agent_id)}")
            if is_online:
                return AgentStatus.ONLINE

        # 2. Fallback para dados persistentes (Caso o Redis caia ou a chave expire)
        if not last_seen:
            return AgentStatus.UNKNOWN
            
        now = datetime.now(timezone.utc)
        delta_seconds = (now - last_seen).total_seconds()
        
        # A expiração real é gerida pelo TTL do Redis, mas o fallback cobre gaps de sincronização
        if delta_seconds <= 60:
            return AgentStatus.ONLINE
            
        return AgentStatus.OFFLINE