export type DashboardEventType = 'agent_online' | 'agent_offline' | 'command_created' | 'command_finished' | string;

export type DashboardEvent = {
  type: DashboardEventType;
  tenant_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};
