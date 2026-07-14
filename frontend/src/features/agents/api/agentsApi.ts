import { api } from '../../../api/httpClient';
import type { Agent, AgentGroup, AgentGroupsResponse, ApiListResponse } from '../types';

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


export async function listAgentGroups(): Promise<AgentGroupsResponse> {
  const response = await api.get<AgentGroupsResponse>('/agent-groups');
  return {
    items: response.data.items || [],
    total: response.data.total ?? response.data.items?.length ?? 0,
  };
}

export async function createAgentGroup(payload: {
  name: string;
  description?: string;
}): Promise<AgentGroup> {
  const response = await api.post<AgentGroup>('/agent-groups', payload);
  return response.data;
}

export async function assignAgentGroup(
  agentId: string,
  groupId: string | null,
): Promise<Agent> {
  const response = await api.put<Agent>(`/agents/${agentId}/group`, {
    group_id: groupId,
  });

  return response.data;
}
