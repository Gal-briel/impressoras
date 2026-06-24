import { httpClient } from './httpClient';
import type { ListResponse, QueryParams, ID } from '../types/api';
import type { Agent, AgentEvent, AgentGroup, AgentTag } from '../types/agent';

export async function listAgents(params?: QueryParams): Promise<ListResponse<Agent>> {
  const { data } = await httpClient.get<ListResponse<Agent>>('/agents', { params });
  return data;
}

export async function getAgent(agentId: ID): Promise<Agent> {
  const { data } = await httpClient.get<Agent>(`/agents/${agentId}`);
  return data;
}

export async function revokeAgent(agentId: ID, revokeReason: string): Promise<Agent> {
  const { data } = await httpClient.patch<Agent>(`/agents/${agentId}/revoke`, { revoke_reason: revokeReason });
  return data;
}

export async function listAgentEvents(agentId: ID): Promise<ListResponse<AgentEvent>> {
  const { data } = await httpClient.get<ListResponse<AgentEvent>>(`/agents/${agentId}/events`);
  return data;
}

export async function listAgentTags(): Promise<ListResponse<AgentTag>> {
  const { data } = await httpClient.get<ListResponse<AgentTag>>('/agent-tags');
  return data;
}

export async function createAgentTag(name: string): Promise<AgentTag> {
  const { data } = await httpClient.post<AgentTag>('/agent-tags', { name });
  return data;
}

export async function listAgentGroups(): Promise<ListResponse<AgentGroup>> {
  const { data } = await httpClient.get<ListResponse<AgentGroup>>('/agent-groups');
  return data;
}

export async function createAgentGroup(payload: { name: string; description?: string }): Promise<AgentGroup> {
  const { data } = await httpClient.post<AgentGroup>('/agent-groups', payload);
  return data;
}
