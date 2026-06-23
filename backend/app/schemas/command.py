# app/schemas/command.py
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from typing import Dict, Any, Optional
from datetime import datetime

class CommandCreate(BaseModel):
    command_type: str = Field(..., max_length=100)
    payload: Dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=60, ge=1, le=3600)
    idempotency_key: str = Field(..., max_length=255)

class CommandResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    agent_id: UUID
    user_id: UUID
    correlation_id: str
    idempotency_key: str
    command_type: str
    payload: Dict[str, Any]
    status: str
    timeout_seconds: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)