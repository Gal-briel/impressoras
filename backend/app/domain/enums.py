# backend/app/domain/enums.py
from enum import Enum

class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    TECHNICIAN = "technician"
    READ_ONLY = "read_only"
    AUDITOR = "auditor"

class AgentStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class EnrollmentStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"

class CommandType(str, Enum):
    RESTART_SPOOLER = "restart_spooler"
    CLEAR_PRINT_QUEUE = "clear_print_queue"
    COLLECT_INVENTORY = "collect_inventory"
    LIST_PRINTERS = "list_printers"
    INSTALL_PRINTER = "install_printer"
    RESTART_SERVICE = "restart_service"
    RUN_SCRIPT_APPROVED = "run_script_approved"

class CommandStatus(str, Enum):
    QUEUED = "queued"
    DISPATCHED = "dispatched"
    ACKNOWLEDGED = "acknowledged"
    EXECUTING = "executing"
    SUCCESS = "success"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"
    EXPIRED = "expired"

class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"