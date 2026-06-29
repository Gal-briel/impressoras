import { api } from '../../../api/httpClient';
import type { Agent, ApiListResponse } from '../types';

function normalizeAgentsResponse(data: ApiListResponse<Agent> | Agent[]): ApiListResponse<Agent> {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
    };
  }

  return {
    items: data.items || [],
    total: data.total ?? data.items?.length ?? 0,
  };
}

export async function getAgents(): Promise<ApiListResponse<Agent>> {
  const response = await api.get<ApiListResponse<Agent> | Agent[]>('/agents');
  return normalizeAgentsResponse(response.data);
}

export async function getAgentById(agentId: string): Promise<Agent> {
  const response = await api.get<Agent>(`/agents/${agentId}`);
  return response.data;
}
