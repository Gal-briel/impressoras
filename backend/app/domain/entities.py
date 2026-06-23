# backend/app/domain/entities.py
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
from .enums import Role, EnrollmentStatus, CommandType, CommandStatus, EventSeverity

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

@dataclass(slots=True)
class Tenant:
    id: UUID = field(default_factory=uuid4)
    name: str = ""
    active: bool = True
    created_at: datetime = field(default_factory=now_utc)

@dataclass(slots=True)
class User:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    email: str = ""
    password_hash: str = ""
    role: Role = Role.READ_ONLY
    created_at: datetime = field(default_factory=now_utc)

@dataclass(slots=True)
class AgentGroup:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    name: str = ""

@dataclass(slots=True)
class Agent:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    hostname: str = ""
    mac_address: str = ""
    os_version: str = ""
    agent_version: str = ""
    last_ip: Optional[str] = None
    enrollment_status: EnrollmentStatus = EnrollmentStatus.PENDING
    api_key_hash: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    last_seen: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=now_utc)
    group_ids: List[UUID] = field(default_factory=list)

@dataclass(slots=True)
class Printer:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    agent_id: UUID = field(default_factory=uuid4)
    name: str = ""
    driver: str = ""
    port: str = ""
    is_default: bool = False
    status: str = "unknown"

@dataclass(slots=True)
class CommandLog:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    agent_id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    correlation_id: str = ""
    idempotency_key: str = ""
    command_type: CommandType = CommandType.COLLECT_INVENTORY
    payload: Dict[str, Any] = field(default_factory=dict)
    status: CommandStatus = CommandStatus.QUEUED
    output: Optional[str] = None
    error_code: Optional[str] = None
    retry_count: int = 0
    timeout_seconds: int = 60
    created_at: datetime = field(default_factory=now_utc)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

@dataclass(slots=True)
class AgentEvent:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    agent_id: UUID = field(default_factory=uuid4)
    event_type: str = ""
    message: str = ""
    severity: EventSeverity = EventSeverity.INFO
    created_at: datetime = field(default_factory=now_utc)

@dataclass(slots=True)
class AuditLog:
    id: UUID = field(default_factory=uuid4)
    tenant_id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    action: str = ""
    target_type: str = ""
    target_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    ip_address: Optional[str] = None
    created_at: datetime = field(default_factory=now_utc)