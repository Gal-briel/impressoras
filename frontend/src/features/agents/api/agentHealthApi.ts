import { api } from '../../../api/httpClient';

export type AgentHealthResponse = {
  agent: {
    id: string;
    name?: string | null;
    hostname?: string | null;
    status: 'online' | 'offline' | string;
    raw_status?: string | null;
    agent_version?: string | null;
    internal_ip?: string | null;
    external_ip?: string | null;
    last_seen_at?: string | null;
    seconds_since_last_seen?: number | null;
  };
  health: {
    is_online: boolean;
    heartbeat_threshold_seconds: number;
    seconds_since_last_seen?: number | null;
    needs_attention: boolean;
  };
  recent_commands: Array<{
    id: string;
    command_type: string;
    status: string;
    error_code?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    completed_at?: string | null;
  }>;
  recent_events: Array<{
    id: string;
    event_type: string;
    severity: string;
    message: string;
    created_at?: string | null;
  }>;
};

export async function getAgentHealth(agentId: string): Promise<AgentHealthResponse> {
  const response = await api.get<AgentHealthResponse>(`/agents/${agentId}/health`);
  return response.data;
}
