export type ApiListResponse<T> = {
  items: T[];
  total: number;
};

export type Agent = {
  id: string;
  tenant_id?: string;
  hostname?: string;
  mac_address?: string;
  os_version?: string;
  agent_version?: string;
  last_ip?: string;
  internal_ip?: string;
  external_ip?: string;
  last_seen?: string;
  last_seen_at?: string;
  calculated_status?: string;
  enrollment_status?: string;
  status?: string;
  capabilities?: string[];
  group_id?: string | null;
  revoked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AgentStatusFilter =
  | 'all'
  | 'online'
  | 'offline'
  | 'approved'
  | 'pending'
  | 'revoked';

export type AgentsFiltersState = {
  search: string;
  status: AgentStatusFilter;
};


export type AgentEventSeverity =
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'
  | 'critical'
  | string;

export type AgentEvent = {
  id: string;
  tenant_id?: string;
  agent_id?: string;
  event_type?: string;
  type?: string;
  severity?: AgentEventSeverity;
  level?: AgentEventSeverity;
  message?: string;
  payload?: Record<string, unknown> | string | null;
  details?: Record<string, unknown> | string | null;
  created_at?: string;
  updated_at?: string;
};

export type AgentEventsResponse = {
  items: AgentEvent[];
  total: number;
  warning?: string;
};

