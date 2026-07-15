# backend/app/workers/timeout_monitor.py

import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.infrastructure.database.models import AuditLog
from app.repositories.base import BaseRepository
from app.repositories.command_repository import CommandRepository
from app.services.command_service import CommandService

logger = logging.getLogger(__name__)


async def monitor_command_timeouts(interval_seconds: int = 10) -> None:
    """
    Varre periodicamente comandos vencidos e delega a regra de negócio
    para CommandService, preservando audit log, websocket e estados terminais.
    """
    while True:
        try:
            async with AsyncSessionLocal() as session:
                command_service = CommandService(
                    CommandRepository(session),
                    BaseRepository(AuditLog, session),
                )

                expired_count = await command_service.expire_stale_commands()

                if expired_count > 0:
                    logger.info(
                        "Command timeout monitor: %s comandos marcados como EXPIRED.",
                        expired_count,
                    )

        except Exception:
            logger.exception("Erro durante a execução do monitor de tempo de comandos")

        await asyncio.sleep(interval_seconds)
