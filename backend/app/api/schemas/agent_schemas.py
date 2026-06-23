# backend/app/api/schemas/agent_schemas.py
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, UUID4

from app.domain.enums import AgentStatus, EnrollmentStatus


class AgentEnrollmentRequest(BaseModel):
    enrollment_token: str
    hostname: str = Field(..., max_length=255)
    mac_address: str = Field(..., max_length=17)
    os_version: str = Field(..., max_length=100)
    agent_version: str = Field(..., max_length=50)
    capabilities: List[str] = Field(default_factory=list)


class AgentEnrollmentResponse(BaseModel):
    agent_id: UUID4
    api_key: str
    enrollment_status: EnrollmentStatus


class AgentCheckInRequest(BaseModel):
    agent_version: str
    internal_ip: Optional[str] = None
    uptime_seconds: int


class AgentRevokeRequest(BaseModel):
    revoke_reason: Optional[str] = Field(default=None, max_length=1000)


class AgentGroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)


class AgentGroupUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)


class AgentGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    tenant_id: UUID4
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AgentGroupListResponse(BaseModel):
    items: List[AgentGroupResponse]
    total: int


class AgentGroupAssignRequest(BaseModel):
    group_id: Optional[UUID4] = Field(default=None)


class AgentTagCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class AgentTagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    tenant_id: UUID4
    name: str
    created_at: datetime


class AgentTagListResponse(BaseModel):
    items: List[AgentTagResponse]
    total: int


class AgentTagsReplaceRequest(BaseModel):
    tag_ids: List[UUID4] = Field(default_factory=list)


class AgentResponse(BaseModel):
    id: UUID4
    tenant_id: UUID4
    group_id: Optional[UUID4] = None
    hostname: str
    mac_address: str
    os_version: str
    agent_version: str
    last_ip: Optional[str]
    enrollment_status: EnrollmentStatus
    capabilities: List[str]
    last_seen: Optional[datetime]
    calculated_status: AgentStatus
    created_at: datetime
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[UUID4] = None
    revoke_reason: Optional[str] = None
    tags: List[AgentTagResponse] = Field(default_factory=list)


class AgentListResponse(BaseModel):
    items: List[AgentResponse]
    total: int


class AgentVersionResponse(BaseModel):
    update_available: bool
    current_version: str
    latest_version: str
    mandatory: bool = False
    package_url: Optional[str] = None
    package_sha256: Optional[str] = None
    signature_thumbprint: Optional[str] = None
    rollback_package_url: Optional[str] = None
    rollback_package_sha256: Optional[str] = None
    notes: Optional[str] = None
