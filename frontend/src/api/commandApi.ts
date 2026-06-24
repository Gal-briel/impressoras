import { httpClient } from './httpClient';
import type { ID, ListResponse, QueryParams } from '../types/api';
import type { Command, CommandCreatePayload } from '../types/command';

export async function listCommands(params?: QueryParams): Promise<ListResponse<Command>> {
  const { data } = await httpClient.get<ListResponse<Command>>('/commands', { params });
  return data;
}

export async function listAgentCommands(agentId: ID): Promise<ListResponse<Command>> {
  const { data } = await httpClient.get<ListResponse<Command>>(`/agents/${agentId}/commands`);
  return data;
}

export async function getCommand(commandId: ID): Promise<Command> {
  const { data } = await httpClient.get<Command>(`/commands/${commandId}`);
  return data;
}

export async function createCommand(agentId: ID, payload: CommandCreatePayload): Promise<Command> {
  const { data } = await httpClient.post<Command>(`/agents/${agentId}/commands`, payload);
  return data;
}
