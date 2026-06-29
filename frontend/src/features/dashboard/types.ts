export type ApiListResponse<T> = {
  items: T[];
  total: number;
};

export type Agent = {
  id: string;
  hostname?: string;
  os_version?: string;
  agent_version?: string;
  enrollment_status?: string;
  status?: string;
  last_ip?: string;
  last_seen_at?: string;
};

export type AgentTag = {
  id: string;
  name: string;
};

export type AgentGroup = {
  id: string;
  name: string;
  description?: string;
};

export type DashboardSummary = {
  totalAgents: number;
  onlineAgents: number;
  offlineOrRevokedAgents: number;
  pendingCommands: number;
  totalTags: number;
  totalGroups: number;
};
