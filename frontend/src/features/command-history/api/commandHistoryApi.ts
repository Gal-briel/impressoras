import { api } from '../../../api/httpClient';
import type { ApiListResponse, Command } from '../../commands/types';
import type { Agent } from '../../agents/types';

type CommandHistoryFilters = {
  agentId?: string;
  status?: string;
  limit?: number;
};

function normalizeList<T>(data: ApiListResponse<T> | T[]): ApiListResponse<T> {
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }

  return {
    items: data?.items || [],
    total: data?.total ?? data?.items?.length ?? 0,
  };
}

export async function listCommandHistory(
  filters: CommandHistoryFilters = {}
): Promise<ApiListResponse<Command>> {
  const params: Record<string, string | number> = {
    limit: filters.limit || 300,
  };

  if (filters.agentId) params.agent_id = filters.agentId;
  if (filters.status && filters.status !== 'all') params.status = filters.status;

  const response = await api.get<ApiListResponse<Command> | Command[]>('/commands', { params });
  return normalizeList(response.data);
}

export async function listCommandHistoryAgents(): Promise<ApiListResponse<Agent>> {
  const response = await api.get<ApiListResponse<Agent> | Agent[]>('/agents');
  return normalizeList(response.data);
}
