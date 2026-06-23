# backend/app/workers/timeout_monitor.py

import asyncio
import logging
from sqlalchemy import update, text
from app.core.database import AsyncSessionLocal
from app.infrastructure.database.enums import CommandStatus
from app.infrastructure.database.models import Command

logger = logging.getLogger(__name__)

async def monitor_command_timeouts(interval_seconds: int = 10) -> None:
    """
    Varre periodicamente o banco de dados em busca de comandos que excederam
    o tempo limite de execução estabelecido ou que expiraram na fila sem resposta.
    """
    while True:
        try:
            async with AsyncSessionLocal() as session:
                # 1. Fluxo de Timeout Existente (Tempo de execução ou ciclo excedido)
                non_terminal_statuses = [
                    CommandStatus.QUEUED,
                    CommandStatus.DISPATCHED,
                    CommandStatus.ACKNOWLEDGED,
                    CommandStatus.EXECUTING
                ]
                
                timeout_stmt = (
                    update(Command)
                    .where(
                        Command.status.in_(non_terminal_statuses),
                        Command.created_at + text("INTERVAL '1 second' * commands.timeout_seconds") < text("NOW()")
                    )
                    .values(status=CommandStatus.TIMED_OUT)
                )
                timeout_result = await session.execute(timeout_stmt)
                
                # 2. NOVO: Varredura e marcação de comandos que estagnaram e expiraram sem resposta
                stale_statuses = [CommandStatus.QUEUED, CommandStatus.DISPATCHED]
                
                expire_stmt = (
                    update(Command)
                    .where(
                        Command.status.in_(stale_statuses),
                        Command.expires_at < text("NOW()")
                    )
                    .values(status=CommandStatus.EXPIRED, error_code="QUEUE_TTL_EXCEEDED")
                )
                expire_result = await session.execute(expire_stmt)
                
                # Confirma ambas as atualizações de lote
                await session.commit()
                
                # Logs informativos se houveram alterações
                if timeout_result.rowcount > 0:
                    logger.info(f"Idempotency Timeout Monitor: {timeout_result.rowcount} comandos marcados como TIMED_OUT.")
                
                if expire_result.rowcount > 0:
                    logger.info(f"Queue Expiration Monitor: {expire_result.rowcount} comandos marcados como EXPIRED.")
                    
        except Exception as e:
            logger.error(f"Erro durante a execução do monitor de tempo de comandos: {e}")
            
        await asyncio.sleep(interval_seconds)