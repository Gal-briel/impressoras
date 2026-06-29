import axios from 'axios';

import { api } from '../../../api/httpClient';
import type { ApiListResponse, Command, CreateCommandPayload } from '../types';

function normalizeCommandsResponse(data: ApiListResponse<Command> | Command[]): ApiListResponse<Command> {
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

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `web-${crypto.randomUUID()}`;
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getCommands(): Promise<ApiListResponse<Command>> {
  try {
    const response = await api.get<ApiListResponse<Command> | Command[]>('/commands');
    return normalizeCommandsResponse(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        items: [],
        total: 0,
      };
    }

    throw error;
  }
}

export async function getAgentCommands(agentId: string): Promise<ApiListResponse<Command>> {
  try {
    const response = await api.get<ApiListResponse<Command> | Command[]>(
      `/agents/${agentId}/commands`
    );

    return normalizeCommandsResponse(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        items: [],
        total: 0,
      };
    }

    throw error;
  }
}

export async function getCommandById(commandId: string): Promise<Command> {
  const response = await api.get<Command>(`/commands/${commandId}`);
  return response.data;
}

export async function createCommand(payload: CreateCommandPayload): Promise<Command> {
  const response = await api.post<Command>(
    `/agents/${payload.agent_id}/commands`,
    {
      command_type: payload.command_type,
      payload: payload.payload || {},
      timeout_seconds: 60,
      idempotency_key: createIdempotencyKey(),
    }
  );

  return response.data;
}
