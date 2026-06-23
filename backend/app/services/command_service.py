# backend/app/services/command_service.py
import asyncio
import logging
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta

from app.repositories.base import BaseRepository 
from app.repositories.command_repository import CommandRepository
from app.schemas.command import CommandCreate, CommandResponse
from app.workers.rabbitmq import rabbitmq_client
from app.infrastructure.database.enums import CommandStatus, EventSeverity
from app.services.agent_event_service import AgentEventService
from app.websocket.manager import websocket_manager # NOVO IMPORT

logger = logging.getLogger(__name__)

class CommandService:
    def __init__(self, repository: CommandRepository, audit_repository: BaseRepository):
        self.repository = repository
        self.audit_repository = audit_repository

    async def dispatch_command(self, tenant_id: UUID, agent_id: UUID, user_id: UUID, command_in: CommandCreate) -> CommandResponse:
        correlation_id = str(uuid4()) 
        now = datetime.now(timezone.utc)
        
        # Define o tempo limite de validade do comando para fins de expiração na fila
        expiration_time = now + timedelta(seconds=command_in.timeout_seconds)
        
        command = await self.repository.create(
            obj_in=command_in,
            tenant_id=tenant_id,
            agent_id=agent_id,
            user_id=user_id,
            correlation_id=correlation_id,
            status=CommandStatus.QUEUED,
            created_at=now,
            expires_at=expiration_time # Persiste a restrição de tempo
        )
        
        # Registro do ciclo de vida no Audit Log.
        # Evita BaseRepository.create(obj_in={}), que quebrava porque dict não tem model_dump().
        audit_log = self.audit_repository.model(
            tenant_id=tenant_id,
            user_id=user_id,
            action="command_created",
            target_type="command",
            target_id=str(command.id),
            metadata_payload={
                "command_type": command.command_type,
                "correlation_id": correlation_id,
                "idempotency_key": command.idempotency_key,
            },
        )
        self.audit_repository.session.add(audit_log)
        await self.audit_repository.session.flush()
        
        payload = {
            "command_id": str(command.id),
            "agent_id": str(agent_id),
            "command_type": command.command_type,
            "payload": command.payload,
            "correlation_id": correlation_id 
        }
        
        await rabbitmq_client.publish_command(routing_key=f"agent.{agent_id}.commands", payload=payload)
        await self.repository.session.commit()
        
        # Dispara evento de criação para o dashboard
        await websocket_manager.broadcast_event(
            str(tenant_id), "command_created", {"command_id": str(command.id), "agent_id": str(agent_id)}
        )
        
        return CommandResponse.model_validate(command)

    async def update_status_idempotent(self, command_id: UUID, new_status: CommandStatus, output: Optional[str] = None, error_code: Optional[str] = None) -> None:
        command = await self.repository.get(command_id)
        if not command:
            return

        # Requisito: impedir execução após expiração
        if datetime.now(timezone.utc) > command.expires_at and command.status not in [CommandStatus.SUCCESS, CommandStatus.FAILED, CommandStatus.CANCELLED, CommandStatus.EXPIRED]:
            await self.repository.update(command, {"status": CommandStatus.EXPIRED, "error_code": "COMMAND_EXPIRED_BEFORE_EXECUTION"})
            await self.repository.session.commit()
            return

        # 1. Validar durante Execução/Terminal: Impedir retrocesso se o comando já estiver finalizado
        terminal_statuses = [CommandStatus.SUCCESS, CommandStatus.FAILED, CommandStatus.CANCELLED, CommandStatus.EXPIRED]
        if command.status in terminal_statuses:
            return  # Idempotência de estado terminal garantida

        # 2. Validar durante ACK: Impedir que um ACK tardio retroceda um comando em execução
        if new_status == CommandStatus.ACKNOWLEDGED and command.status == CommandStatus.EXECUTING:
            return

        # Executa a transição segura
        update_data = {"status": new_status}
        if output is not None:
            update_data["output"] = output
        if error_code is not None:
            update_data["error_code"] = error_code

        await self.repository.update(command, update_data)
        await self.repository.session.commit()

    async def handle_command_completion(self, command_id: UUID, payload_status: str, output: Optional[str] = None, error_code: Optional[str] = None) -> None:
        command = await self.repository.get(command_id)
        if not command:
            return

        # Impede alterações se o comando já estiver em um estado terminal de sucesso ou cancelamento
        if command.status in [CommandStatus.SUCCESS, CommandStatus.CANCELLED]:
            return

        if payload_status == "FAILED":
            # Requisito: verificar se ainda há tentativas disponíveis para reprocessar automaticamente
            if command.retry_count < command.max_retries:
                new_retry_count = command.retry_count + 1
                
                logger.info(
                    f"Reprocessando comando {command_id} automaticamente. "
                    f"Tentativa {new_retry_count} de {command.max_retries}. Motivo: Erro {error_code}"
                )

                # Atualiza o comando para voltar à fila incrementando o contador
                update_data = {
                    "status": CommandStatus.QUEUED,
                    "retry_count": new_retry_count,
                    "error_code": error_code,
                    "output": output
                }
                await self.repository.update(command, update_data)
                
                # Prepara o payload para reinserção no fluxo atual de execução
                retry_payload = {
                    "command_id": str(command.id),
                    "agent_id": str(command.agent_id),
                    "command_type": command.command_type,
                    "payload": command.payload,
                    "correlation_id": command.correlation_id
                }
                
                # Preserva o fluxo atual publicando na mesma fila do agente
                await rabbitmq_client.publish_command(
                    routing_key=f"agent.{command.agent_id}.commands", 
                    payload=retry_payload
                )
                await self.repository.session.commit()
                return # Aborta a transição para FAILED definitivo

            else:
                logger.warning(f"Comando {command_id} esgotou o limite máximo de {command.max_retries} tentativas.")
                
                # Hook de Evento (Fire-and-forget): Disparado quando esgotam as tentativas
                asyncio.create_task(AgentEventService.log_event(
                    tenant_id=command.tenant_id,
                    agent_id=command.agent_id,
                    event_type="command_failed",
                    message=f"Command {command.command_type} failed: {error_code}",
                    severity=EventSeverity.ERROR
                ))

        # Requisito: logar inventory_collected
        elif payload_status == "SUCCESS" and command.command_type == "collect_inventory":
            asyncio.create_task(AgentEventService.log_event(
                tenant_id=command.tenant_id,
                agent_id=command.agent_id,
                event_type="inventory_collected",
                message="Inventory successfully updated.",
                severity=EventSeverity.INFO
            ))

        # Se for SUCCESS ou se os retries falharem definitivamente, segue o fluxo normal
        final_status = CommandStatus.SUCCESS if payload_status == "SUCCESS" else CommandStatus.FAILED
        
        update_data = {
            "status": final_status,
            "output": output,
            "error_code": error_code if final_status == CommandStatus.FAILED else None
        }
        
        await self.repository.update(command, update_data)
        await self.repository.session.commit()

        # Dispara evento de finalização para o dashboard
        await websocket_manager.broadcast_event(
            str(command.tenant_id), "command_finished", {"command_id": str(command_id), "status": payload_status}
        )