// frontend/src/domain/models/Agent.ts
export type AgentStatus = 'online' | 'offline' | 'unknown';

export interface AgentTag {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface AgentGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  tenant_id: string;
  group_id: string | null;
  hostname: string;
  mac_address: string;
  os_version: string;
  agent_version: string;
  last_ip: string | null;
  enrollment_status: string;
  capabilities: string[];
  calculated_status: AgentStatus;
  last_seen: string | null;
  created_at: string;
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoke_reason?: string | null;
  tags: AgentTag[];
}
