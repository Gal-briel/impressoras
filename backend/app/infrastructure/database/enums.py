# backend/app/infrastructure/database/enums.py
import enum

class RoleStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"

class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    BLOCKED = "blocked"

class AgentStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class EnrollmentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"

class CommandStatus(str, enum.Enum):
    QUEUED = "queued"
    DISPATCHED = "dispatched"
    ACKNOWLEDGED = "acknowledged"
    EXECUTING = "executing"
    SUCCESS = "success"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"
    EXPIRED = "expired"

class EventSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"