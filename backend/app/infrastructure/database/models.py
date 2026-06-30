# backend/app/infrastructure/database/models.py
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, SoftDeleteMixin, TimestampMixin
from .enums import CommandStatus, EnrollmentStatus, EventSeverity, UserStatus


role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base, TimestampMixin):
    __tablename__ = "permissions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))

    roles: Mapped[List["Role"]] = relationship(
        "Role",
        secondary=role_permissions,
        back_populates="permissions",
    )

    __table_args__ = (Index("idx_permission_name", "name"),)


class Tenant(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tenants"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[List["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    roles: Mapped[List["Role"]] = relationship("Role", back_populates="tenant", cascade="all, delete-orphan")
    agents: Mapped[List["Agent"]] = relationship("Agent", back_populates="tenant", cascade="all, delete-orphan")
    groups: Mapped[List["AgentGroup"]] = relationship("AgentGroup", back_populates="tenant", cascade="all, delete-orphan")
    agent_tags: Mapped[List["AgentTag"]] = relationship("AgentTag", back_populates="tenant", cascade="all, delete-orphan")
    agent_releases: Mapped[List["AgentRelease"]] = relationship("AgentRelease", back_populates="tenant")
    commands: Mapped[List["Command"]] = relationship("Command", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs: Mapped[List["AuditLog"]] = relationship("AuditLog", back_populates="tenant", cascade="all, delete-orphan")
    agent_events: Mapped[List["AgentEvent"]] = relationship("AgentEvent", back_populates="tenant", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_tenant_name", "name"),
        Index("idx_tenant_active", "active"),
    )


class Role(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="roles")
    users: Mapped[List["User"]] = relationship("User", back_populates="role")
    permissions: Mapped[List["Permission"]] = relationship(
        "Permission",
        secondary=role_permissions,
        back_populates="roles",
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_role_tenant_name"),
        Index("idx_role_tenant_id_name", "tenant_id", "name"),
    )


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[UUID] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[UserStatus] = mapped_column(String(50), default=UserStatus.ACTIVE, nullable=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    commands: Mapped[List["Command"]] = relationship("Command", back_populates="user")
    audit_logs: Mapped[List["AuditLog"]] = relationship("AuditLog", back_populates="user")

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_user_tenant_email"),
        Index("idx_user_tenant_email", "tenant_id", "email"),
    )


class AgentGroup(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "agent_groups"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="groups")
    agents: Mapped[List["Agent"]] = relationship("Agent", back_populates="group")

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_agentgroup_tenant_name"),
        Index("idx_agentgroup_tenant_name", "tenant_id", "name"),
    )


class Agent(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "agents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    group_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("agent_groups.id", ondelete="SET NULL"))
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    mac_address: Mapped[str] = mapped_column(String(17), nullable=False)
    os_version: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_version: Mapped[str] = mapped_column(String(50), nullable=False)
    last_ip: Mapped[Optional[str]] = mapped_column(String(45))
    enrollment_status: Mapped[EnrollmentStatus] = mapped_column(String(50), default=EnrollmentStatus.PENDING, nullable=False)
    api_key_hash: Mapped[Optional[str]] = mapped_column(String(255))
    capabilities: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoke_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="agents")
    group: Mapped[Optional["AgentGroup"]] = relationship("AgentGroup", back_populates="agents")
    tag_assignments: Mapped[List["AgentTagAssignment"]] = relationship(
        "AgentTagAssignment",
        back_populates="agent",
        cascade="all, delete-orphan",
    )
    tags: Mapped[List["AgentTag"]] = relationship(
        "AgentTag",
        secondary="agent_tag_assignments",
        primaryjoin="Agent.id == AgentTagAssignment.agent_id",
        secondaryjoin="AgentTag.id == AgentTagAssignment.tag_id",
        viewonly=True,
    )
    printers: Mapped[List["Printer"]] = relationship("Printer", back_populates="agent", cascade="all, delete-orphan")
    commands: Mapped[List["Command"]] = relationship("Command", back_populates="agent", cascade="all, delete-orphan")
    events: Mapped[List["AgentEvent"]] = relationship("AgentEvent", back_populates="agent", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("tenant_id", "mac_address", name="uq_agent_tenant_mac"),
        Index("idx_agent_tenant_mac", "tenant_id", "mac_address"),
        Index("idx_agent_tenant_group", "tenant_id", "group_id"),
        Index("idx_agent_tenant_last_seen", "tenant_id", "last_seen"),
        Index("idx_agent_tenant_revoked", "tenant_id", "revoked_at"),
        Index("idx_agent_revoked_by", "revoked_by"),
    )


class AgentTag(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "agent_tags"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="agent_tags")
    assignments: Mapped[List["AgentTagAssignment"]] = relationship(
        "AgentTagAssignment",
        back_populates="tag",
        cascade="all, delete-orphan",
    )
    agents: Mapped[List["Agent"]] = relationship(
        "Agent",
        secondary="agent_tag_assignments",
        primaryjoin="AgentTag.id == AgentTagAssignment.tag_id",
        secondaryjoin="Agent.id == AgentTagAssignment.agent_id",
        viewonly=True,
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "normalized_name", name="uq_agent_tag_tenant_normalized_name"),
        Index("idx_agent_tag_tenant_name", "tenant_id", "name"),
        Index("idx_agent_tag_tenant_normalized", "tenant_id", "normalized_name"),
    )


class AgentTagAssignment(Base, TimestampMixin):
    __tablename__ = "agent_tag_assignments"

    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[UUID] = mapped_column(ForeignKey("agent_tags.id", ondelete="CASCADE"), primary_key=True)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="tag_assignments")
    tag: Mapped["AgentTag"] = relationship("AgentTag", back_populates="assignments")

    __table_args__ = (
        Index("idx_agent_tag_assignment_tenant_agent", "tenant_id", "agent_id"),
        Index("idx_agent_tag_assignment_tenant_tag", "tenant_id", "tag_id"),
    )


class Printer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "printers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    driver: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="unknown", nullable=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", viewonly=True)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="printers")

    __table_args__ = (
        UniqueConstraint("agent_id", "name", name="uq_printer_agent_name"),
        Index("idx_printer_tenant_agent", "tenant_id", "agent_id"),
    )


class Command(Base, TimestampMixin):
    __tablename__ = "commands"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    command_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[CommandStatus] = mapped_column(String(50), default=CommandStatus.QUEUED, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Campos já usados pelo CommandService em retries. Mantidos aqui para não quebrar o fluxo existente.
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output: Mapped[Optional[str]] = mapped_column(Text)
    error_code: Mapped[Optional[str]] = mapped_column(String(100))

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="commands", viewonly=True)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="commands")
    user: Mapped["User"] = relationship("User", back_populates="commands")
    result: Mapped[Optional["CommandResult"]] = relationship(
        "CommandResult",
        back_populates="command",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("agent_id", "idempotency_key", name="uq_command_agent_idempotency"),
        Index("idx_command_tenant_agent_status", "tenant_id", "agent_id", "status"),
        Index("idx_command_tenant_created_at", "tenant_id", "created_at"),
    )


class CommandResult(Base, TimestampMixin):
    __tablename__ = "command_results"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    command_id: Mapped[UUID] = mapped_column(ForeignKey("commands.id", ondelete="CASCADE"), nullable=False, unique=True)
    output: Mapped[Optional[str]] = mapped_column(Text)
    error_code: Mapped[Optional[str]] = mapped_column(String(50))
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    tenant: Mapped["Tenant"] = relationship("Tenant", viewonly=True)
    command: Mapped["Command"] = relationship("Command", back_populates="result")

    __table_args__ = (Index("idx_cmdresult_command_id", "command_id"),)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_id: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="audit_logs", viewonly=True)
    user: Mapped["User"] = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("idx_audit_tenant_created", "tenant_id", "created_at"),
        Index("idx_audit_tenant_user", "tenant_id", "user_id"),
    )


class AgentEvent(Base, TimestampMixin):
    __tablename__ = "agent_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[EventSeverity] = mapped_column(String(50), default=EventSeverity.INFO, nullable=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="agent_events", viewonly=True)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="events")

    __table_args__ = (
        Index("idx_event_tenant_agent_created", "tenant_id", "agent_id", "created_at"),
        Index("idx_event_tenant_severity", "tenant_id", "severity"),
    )


class AgentRelease(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "agent_releases"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    platform: Mapped[str] = mapped_column(String(50), default="windows", nullable=False)
    channel: Mapped[str] = mapped_column(String(50), default="stable", nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    package_url: Mapped[str] = mapped_column(Text, nullable=False)
    package_sha256: Mapped[str] = mapped_column(String(128), nullable=False)
    signature_thumbprint: Mapped[str] = mapped_column(String(128), nullable=False)
    rollback_package_url: Mapped[Optional[str]] = mapped_column(Text)
    rollback_package_sha256: Mapped[Optional[str]] = mapped_column(String(128))
    min_supported_version: Mapped[Optional[str]] = mapped_column(String(50))
    rollout_percentage: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    tenant: Mapped[Optional["Tenant"]] = relationship("Tenant", back_populates="agent_releases")

    __table_args__ = (
        Index("idx_agent_release_lookup", "tenant_id", "platform", "channel", "is_active"),
        Index("idx_agent_release_version", "platform", "channel", "version"),
    )
