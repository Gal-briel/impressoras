# backend/app/services/agent_event_service.py

from uuid import UUID
from app.core.database import AsyncSessionLocal
from app.infrastructure.database.models import AgentEvent
from app.infrastructure.database.enums import EventSeverity

class AgentEventService:
    @staticmethod
    async def log_event(tenant_id: UUID, agent_id: UUID, event_type: str, message: str, severity: EventSeverity = EventSeverity.INFO) -> None:
        """
        Persiste um evento do agente usando uma sessão isolada para ser chamado
        como background task sem interferir no fluxo principal.
        """
        async with AsyncSessionLocal() as session:
            event = AgentEvent(
                tenant_id=tenant_id,
                agent_id=agent_id,
                event_type=event_type,
                message=message,
                severity=severity
            )
            session.add(event)
            try:
                await session.commit()
            except Exception:
                pass # Silencia falhas de log para não derrubar fluxos críticos