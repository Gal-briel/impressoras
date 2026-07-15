# backend/app/services/command_service.py
import asyncio
import json
import re
import logging
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.repositories.base import BaseRepository 
from app.repositories.command_repository import CommandRepository
from app.schemas.command import CommandCreate, CommandResponse
from app.workers.rabbitmq import rabbitmq_client
from app.infrastructure.database.enums import CommandStatus, EventSeverity
from app.infrastructure.database.models import Agent, Command
from app.services.agent_event_service import AgentEventService
from app.websocket.manager import websocket_manager # NOVO IMPORT
from app.services.command_policy import CommandPolicyViolation, validate_and_authorize_command

logger = logging.getLogger(__name__)


SENSITIVE_AUDIT_KEYS = {
    "password",
    "senha",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "credentials",
    "private_key",
}


MAX_COMMAND_OUTPUT_CHARS = 500_000


def _is_sensitive_key(key: object) -> bool:
    key_text = str(key).lower()
    return any(secret in key_text for secret in SENSITIVE_AUDIT_KEYS)


def _redact_sensitive_text(value: str) -> str:
    text = str(value)

    patterns = [
        r"(?i)(authorization\s*[:=]\s*)(bearer|apikey)?\s*[A-Za-z0-9._~+/=-]{12,}",
        r"(?i)((?:api[_-]?key|apikey|token|password|senha|secret)\s*[:=]\s*)[\"']?[^\"'\s,;}]+",
    ]

    for pattern in patterns:
        text = re.sub(pattern, r"\1[redacted]", text)

    return text


def _limit_command_output_text(value: str) -> str:
    text = str(value)

    if len(text) <= MAX_COMMAND_OUTPUT_CHARS:
        return text

    preview = text[:MAX_COMMAND_OUTPUT_CHARS]

    return json.dumps(
        {
            "_truncated": True,
            "message": "Output truncado pelo backend para proteger banco/painel.",
            "original_length": len(text),
            "max_length": MAX_COMMAND_OUTPUT_CHARS,
            "preview": preview,
        },
        ensure_ascii=False,
        default=str,
    )


def _sanitize_command_output_value(value, depth: int = 0):
    if depth > 8:
        return "[truncated-depth]"

    if isinstance(value, dict):
        clean = {}

        for key, item in value.items():
            if _is_sensitive_key(key):
                clean[str(key)] = "[redacted]"
            else:
                clean[str(key)] = _sanitize_command_output_value(item, depth + 1)

        return clean

    if isinstance(value, list):
        return [_sanitize_command_output_value(item, depth + 1) for item in value]

    if isinstance(value, str):
        return _redact_sensitive_text(value)

    return value


def sanitize_command_output(output):
    if output is None:
        return None

    if isinstance(output, (dict, list)):
        sanitized = _sanitize_command_output_value(output)
        text = json.dumps(sanitized, ensure_ascii=False, default=str)
        return _limit_command_output_text(text)

    raw_text = str(output)

    try:
        parsed = json.loads(raw_text)
    except Exception:
        return _limit_command_output_text(_redact_sensitive_text(raw_text))

    sanitized = _sanitize_command_output_value(parsed)
    text = json.dumps(sanitized, ensure_ascii=False, default=str)
    return _limit_command_output_text(text)


def _safe_audit_output(value):
    if value is None:
        return None

    if isinstance(value, (dict, list)):
        return _sanitize_audit_value(value)

    text = str(value)

    try:
        parsed = json.loads(text)
        return _sanitize_audit_value(parsed)
    except Exception:
        if len(text) > 1000:
            return text[:1000] + "...[truncated]"
        return text


def _sanitize_audit_value(value, depth: int = 0):
    if depth > 3:
        return "[truncated]"

    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if any(secret in key_text for secret in SENSITIVE_AUDIT_KEYS):
                clean[str(key)] = "[redacted]"
            else:
                clean[str(key)] = _sanitize_audit_value(item, depth + 1)
        return clean

    if isinstance(value, list):
        return [_sanitize_audit_value(item, depth + 1) for item in value[:20]]

    if isinstance(value, str):
        if len(value) > 500:
            return value[:500] + "...[truncated]"
        return value

    return value



def _canonical_command_payload(payload) -> str:
    return json.dumps(
        payload or {},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def _same_idempotent_command(existing: Command, command_in: CommandCreate) -> bool:
    return (
        existing.command_type == command_in.command_type
        and existing.timeout_seconds == command_in.timeout_seconds
        and _canonical_command_payload(existing.payload or {})
        == _canonical_command_payload(command_in.payload or {})
    )


class CommandService:
    def __init__(self, repository: CommandRepository, audit_repository: BaseRepository):
        self.repository = repository
        self.audit_repository = audit_repository

    async def dispatch_command(self, tenant_id: UUID, agent_id: UUID, user_id: UUID, command_in: CommandCreate, user_permissions: Optional[list[str]] = None, ip_address: Optional[str] = None) -> CommandResponse:
        correlation_id = str(uuid4())
        now = datetime.now(timezone.utc)

        # Valida comando, permissão e payload antes de consultar agente,
        # gravar no banco ou publicar na fila.
        validate_and_authorize_command(
            command_type=command_in.command_type,
            payload=command_in.payload or {},
            permissions=user_permissions or [],
        )

        # Segurança multi-tenant:
        # nunca cria comando para um agent_id que não pertença ao tenant do usuário.
        agent_result = await self.repository.session.execute(
            select(Agent).where(
                Agent.id == agent_id,
                Agent.tenant_id == tenant_id,
            )
        )
        agent = agent_result.scalar_one_or_none()

        if not agent:
            raise PermissionError("Agent not found in current tenant")

        enrollment_status = str(getattr(agent.enrollment_status, "value", agent.enrollment_status)).lower()

        if agent.revoked_at is not None or enrollment_status == "revoked":
            raise PermissionError("Agent revoked")

        if enrollment_status != "approved":
            raise PermissionError("Agent not approved")

        # Idempotência:
        # retry HTTP/clique duplo com a mesma chave deve devolver o mesmo comando.
        # mesma chave com payload diferente deve ser bloqueada.
        existing_result = await self.repository.session.execute(
            select(Command).where(
                Command.tenant_id == tenant_id,
                Command.agent_id == agent_id,
                Command.idempotency_key == command_in.idempotency_key,
            )
        )
        existing_command = existing_result.scalar_one_or_none()

        if existing_command:
            if not _same_idempotent_command(existing_command, command_in):
                raise CommandPolicyViolation(
                    "Idempotency key already used with different command payload"
                )

            return CommandResponse.model_validate(existing_command)

        # Define o tempo limite de validade do comando para fins de expiração na fila
        expiration_time = now + timedelta(seconds=command_in.timeout_seconds)

        try:
            command = await self.repository.create(
                obj_in=command_in,
                tenant_id=tenant_id,
                agent_id=agent_id,
                user_id=user_id,
                correlation_id=correlation_id,
                status=CommandStatus.QUEUED,
                created_at=now,
                expires_at=expiration_time,
            )
        except IntegrityError:
            await self.repository.session.rollback()

            existing_result = await self.repository.session.execute(
                select(Command).where(
                    Command.tenant_id == tenant_id,
                    Command.agent_id == agent_id,
                    Command.idempotency_key == command_in.idempotency_key,
                )
            )
            existing_command = existing_result.scalar_one_or_none()

            if existing_command and _same_idempotent_command(existing_command, command_in):
                return CommandResponse.model_validate(existing_command)

            raise CommandPolicyViolation("Idempotency key conflict")

        # Registro do ciclo de vida no Audit Log.
        # Evita BaseRepository.create(obj_in={}), que quebrava porque dict não tem model_dump().
        command_payload = command.payload or {}
        audit_metadata = {
            "command_id": str(command.id),
            "agent_id": str(agent_id),
            "agent_hostname": getattr(agent, "hostname", None),
            "command_type": command.command_type,
            "correlation_id": correlation_id,
            "idempotency_key": command.idempotency_key,
            "timeout_seconds": command.timeout_seconds,
            "payload": _sanitize_audit_value(command_payload),
        }

        audit_log = self.audit_repository.model(
            tenant_id=tenant_id,
            user_id=user_id,
            action="command_created",
            target_type="command",
            target_id=str(command.id),
            ip_address=ip_address,
            metadata_payload=audit_metadata,
        )
        self.audit_repository.session.add(audit_log)

        if command.command_type == "update_agent":
            update_audit_log = self.audit_repository.model(
                tenant_id=tenant_id,
                user_id=user_id,
                action="agent_update_requested",
                target_type="agent",
                target_id=str(agent_id),
                ip_address=ip_address,
                metadata_payload={
                    "command_id": str(command.id),
                    "agent_id": str(agent_id),
                    "agent_hostname": getattr(agent, "hostname", None),
                    "correlation_id": correlation_id,
                    "idempotency_key": command.idempotency_key,
                    "version": command_payload.get("version"),
                    "release_id": command_payload.get("release_id"),
                    "package_url": command_payload.get("package_url"),
                    "sha256": command_payload.get("sha256"),
                    "timeout_seconds": command.timeout_seconds,
                },
            )
            self.audit_repository.session.add(update_audit_log)

        await self.audit_repository.session.flush()

        payload = {
            "command_id": str(command.id),
            "agent_id": str(agent_id),
            "command_type": command.command_type,
            "payload": command.payload,
            "correlation_id": correlation_id,
        }

        await rabbitmq_client.publish_command(
            routing_key=f"agent.{agent_id}.commands",
            payload=payload,
        )
        await self.repository.session.commit()

        # Dispara evento de criação para o dashboard
        await websocket_manager.broadcast_event(
            str(tenant_id),
            "command_created",
            {"command_id": str(command.id), "agent_id": str(agent_id)},
        )

        return CommandResponse.model_validate(command)

    async def expire_stale_commands(self, limit: int = 500) -> int:
        """Marca comandos vencidos como expired sem sobrescrever estados terminais."""
        now = datetime.now(timezone.utc)

        stale_statuses = [
            getattr(CommandStatus, name)
            for name in ("QUEUED", "DISPATCHED", "ACKNOWLEDGED", "EXECUTING")
            if hasattr(CommandStatus, name)
        ]

        if not stale_statuses:
            return 0

        result = await self.repository.session.execute(
            select(Command)
            .where(
                Command.status.in_(stale_statuses),
                Command.expires_at.is_not(None),
                Command.expires_at <= now,
            )
            .order_by(Command.expires_at.asc())
            .limit(limit)
        )

        commands = list(result.scalars().all())

        if not commands:
            return 0

        expired_events: list[dict[str, str]] = []

        for command in commands:
            current_status = str(
                command.status.value if hasattr(command.status, "value") else command.status
            )

            command.status = CommandStatus.EXPIRED
            command.error_code = "COMMAND_EXPIRED"
            command.finished_at = now

            if not command.output:
                command.output = json.dumps(
                    {
                        "status": "expired",
                        "reason": "Command expired before completion.",
                    },
                    ensure_ascii=False,
                )

            metadata = {
                "command_id": str(command.id),
                "agent_id": str(command.agent_id),
                "command_type": command.command_type,
                "previous_status": current_status,
                "new_status": "expired",
                "error_code": "COMMAND_EXPIRED",
                "correlation_id": command.correlation_id,
                "idempotency_key": command.idempotency_key,
                "expires_at": command.expires_at.isoformat() if command.expires_at else None,
                "expired_at": now.isoformat(),
                "payload": _sanitize_audit_value(command.payload or {}),
            }

            audit_log = self.audit_repository.model(
                tenant_id=command.tenant_id,
                user_id=command.user_id,
                action="command_expired",
                target_type="command",
                target_id=str(command.id),
                metadata_payload=metadata,
            )
            self.audit_repository.session.add(audit_log)

            expired_events.append(
                {
                    "tenant_id": str(command.tenant_id),
                    "command_id": str(command.id),
                    "agent_id": str(command.agent_id),
                    "status": "expired",
                }
            )

        await self.repository.session.flush()
        await self.repository.session.commit()

        for event in expired_events:
            await websocket_manager.broadcast_event(
                event["tenant_id"],
                "command_finished",
                {
                    "command_id": event["command_id"],
                    "agent_id": event["agent_id"],
                    "status": "EXPIRED",
                },
            )
            await websocket_manager.broadcast_event(
                event["tenant_id"],
                "command_expired",
                {
                    "command_id": event["command_id"],
                    "agent_id": event["agent_id"],
                    "status": "EXPIRED",
                },
            )

        return len(expired_events)


    async def update_status_idempotent(self, command_id: UUID, new_status: CommandStatus, output: Optional[str] = None, error_code: Optional[str] = None) -> None:
        command = await self.repository.get(command_id)
        if not command:
            return

        # Requisito: impedir execução após expiração
        now = datetime.now(timezone.utc)
        if now > command.expires_at and command.status not in [CommandStatus.SUCCESS, CommandStatus.FAILED, CommandStatus.CANCELLED, CommandStatus.EXPIRED]:
            await self.repository.update(command, {
                "status": CommandStatus.EXPIRED,
                "error_code": "COMMAND_EXPIRED_BEFORE_EXECUTION",
                "finished_at": now,
            })
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
        now = datetime.now(timezone.utc)
        sanitized_output = sanitize_command_output(output)
        update_data = {"status": new_status}

        if new_status in [CommandStatus.DISPATCHED, CommandStatus.ACKNOWLEDGED]:
            if getattr(command, "dispatched_at", None) is None:
                update_data["dispatched_at"] = now

        if new_status == CommandStatus.EXECUTING:
            if getattr(command, "dispatched_at", None) is None:
                update_data["dispatched_at"] = now
            if getattr(command, "started_at", None) is None:
                update_data["started_at"] = now

        if new_status in [CommandStatus.SUCCESS, CommandStatus.FAILED, CommandStatus.CANCELLED, CommandStatus.EXPIRED]:
            if getattr(command, "finished_at", None) is None:
                update_data["finished_at"] = now

        if output is not None:
            update_data["output"] = sanitized_output
        if error_code is not None:
            update_data["error_code"] = error_code

        await self.repository.update(command, update_data)
        await self.repository.session.commit()

    async def handle_command_completion(self, command_id: UUID, payload_status: str, output: Optional[str] = None, error_code: Optional[str] = None) -> None:
        command = await self.repository.get(command_id)
        if not command:
            return

        # Impede alterações se o comando já estiver em qualquer estado terminal.
        # Isso evita que respostas atrasadas do agente sobrescrevam um FAILED/EXPIRED,
        # por exemplo um update_agent que falhou por SHA inválido e depois receba outro status.
        terminal_statuses = [
            CommandStatus.SUCCESS,
            CommandStatus.FAILED,
            CommandStatus.CANCELLED,
            CommandStatus.EXPIRED,
        ]

        if command.status in terminal_statuses:
            return

        sanitized_output = sanitize_command_output(output)

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
                    "output": sanitized_output
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
        
        now = datetime.now(timezone.utc)

        update_data = {
            "status": final_status,
            "output": sanitized_output,
            "error_code": error_code if final_status == CommandStatus.FAILED else None,
            "finished_at": now,
        }

        if getattr(command, "dispatched_at", None) is None:
            update_data["dispatched_at"] = now

        if getattr(command, "started_at", None) is None:
            update_data["started_at"] = now
        
        await self.repository.update(command, update_data)

        completion_metadata = {
            "command_id": str(command.id),
            "agent_id": str(command.agent_id),
            "command_type": command.command_type,
            "correlation_id": command.correlation_id,
            "idempotency_key": command.idempotency_key,
            "status": str(final_status.value if hasattr(final_status, "value") else final_status),
            "payload_status": payload_status,
            "error_code": error_code,
            "output": _safe_audit_output(sanitized_output),
        }

        audit_action = "agent_update_finished" if command.command_type == "update_agent" else "command_finished"

        if command.command_type == "update_agent":
            command_payload = command.payload or {}
            completion_metadata["version"] = command_payload.get("version")
            completion_metadata["release_id"] = command_payload.get("release_id")
            completion_metadata["package_url"] = command_payload.get("package_url")
            completion_metadata["sha256"] = command_payload.get("sha256")

        audit_log = self.audit_repository.model(
            tenant_id=command.tenant_id,
            user_id=command.user_id,
            action=audit_action,
            target_type="command",
            target_id=str(command.id),
            metadata_payload=_sanitize_audit_value(completion_metadata),
        )
        self.audit_repository.session.add(audit_log)

        await self.repository.session.commit()

        # Dispara evento de finalização para o dashboard
        await websocket_manager.broadcast_event(
            str(command.tenant_id), "command_finished", {"command_id": str(command_id), "status": payload_status}
        )