import type { ID } from './api';

export type AgentCalculatedStatus = 'online' | 'offline' | 'unknown';
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type AgentTag = {
  id: ID;
  tenant_id?: ID;
  name: string;
  created_at?: string;
};

export type AgentGroup = {
  id: ID;
  tenant_id?: ID;
  name: string;
  description?: string | null;
  created_at?: string;
};

export type Agent = {
  id: ID;
  tenant_id: ID;
  group_id?: ID | null;
  hostname: string;
  mac_address?: string;
  os_version?: string;
  agent_version?: string;
  last_ip?: string | null;
  enrollment_status?: EnrollmentStatus;
  calculated_status?: AgentCalculatedStatus;
  capabilities?: string[];
  last_seen?: string | null;
  created_at?: string;
  revoked_at?: string | null;
  revoked_by?: ID | null;
  revoke_reason?: string | null;
  tags?: AgentTag[];
};

export type AgentEvent = {
  id: ID;
  tenant_id: ID;
  agent_id: ID;
  event_type: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical' | string;
  created_at: string;
};
