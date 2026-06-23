// frontend/src/application/services/agentService.ts
import { httpClient } from '../../infrastructure/http/httpClient';
import { Agent, AgentGroup, AgentTag } from '../../domain/models/Agent';

export interface GetAgentsParams {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface CreateAgentTagPayload {
  name: string;
}

export interface ReplaceAgentTagsPayload {
  tag_ids: string[];
}

export interface CreateAgentGroupPayload {
  name: string;
  description?: string | null;
}

export interface UpdateAgentGroupPayload {
  name?: string;
  description?: string | null;
}

export const AgentService = {
  getAgents: async (params: GetAgentsParams): Promise<PaginatedResponse<Agent>> => {
    const { data } = await httpClient.get('/agents', { params });
    return data;
  },

  getAgent: async (id: string): Promise<Agent> => {
    const { data } = await httpClient.get(`/agents/${id}`);
    return data;
  },

  revokeAgent: async (id: string, revoke_reason: string): Promise<Agent> => {
    const { data } = await httpClient.patch(`/agents/${id}/revoke`, { revoke_reason });
    return data;
  },

  rotateKey: async (id: string): Promise<{ message: string; agent_id: string; new_api_key: string }> => {
    const { data } = await httpClient.post(`/agents/${id}/rotate-key`);
    return data;
  },

  getTags: async (): Promise<PaginatedResponse<AgentTag>> => {
    const { data } = await httpClient.get('/agent-tags');
    return data;
  },

  createTag: async (payload: CreateAgentTagPayload): Promise<AgentTag> => {
    const { data } = await httpClient.post('/agent-tags', payload);
    return data;
  },

  deleteTag: async (tagId: string): Promise<void> => {
    await httpClient.delete(`/agent-tags/${tagId}`);
  },

  getAgentTags: async (agentId: string): Promise<PaginatedResponse<AgentTag>> => {
    const { data } = await httpClient.get(`/agents/${agentId}/tags`);
    return data;
  },

  replaceAgentTags: async (agentId: string, tagIds: string[]): Promise<PaginatedResponse<AgentTag>> => {
    const { data } = await httpClient.put(`/agents/${agentId}/tags`, { tag_ids: tagIds });
    return data;
  },

  getGroups: async (): Promise<PaginatedResponse<AgentGroup>> => {
    const { data } = await httpClient.get('/agent-groups');
    return data;
  },

  createGroup: async (payload: CreateAgentGroupPayload): Promise<AgentGroup> => {
    const { data } = await httpClient.post('/agent-groups', payload);
    return data;
  },

  updateGroup: async (groupId: string, payload: UpdateAgentGroupPayload): Promise<AgentGroup> => {
    const { data } = await httpClient.patch(`/agent-groups/${groupId}`, payload);
    return data;
  },

  deleteGroup: async (groupId: string): Promise<void> => {
    await httpClient.delete(`/agent-groups/${groupId}`);
  },

  assignGroup: async (agentId: string, groupId: string | null): Promise<Agent> => {
    const { data } = await httpClient.put(`/agents/${agentId}/group`, { group_id: groupId });
    return data;
  },
};
