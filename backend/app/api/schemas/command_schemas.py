# backend/app/api/schemas/command_schemas.py
from pydantic import BaseModel, UUID4, Field
from typing import Dict, Any, Optional
from datetime import datetime
from app.domain.enums import CommandType, CommandStatus

class CommandCreateRequest(BaseModel):
    command_type: CommandType
    payload: Dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=60, ge=1, le=3600)
    idempotency_key: str = Field(..., max_length=255)

class CommandResponse(BaseModel):
    id: UUID4
    agent_id: UUID4
    user_id: UUID4
    correlation_id: str
    idempotency_key: str
    command_type: CommandType
    payload: Dict[str, Any]
    status: CommandStatus
    output: Optional[str]
    error_code: Optional[str]
    retry_count: int
    timeout_seconds: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

class CommandStatusUpdateRequest(BaseModel):
    status: CommandStatus
    output: Optional[str] = None
    error_code: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None