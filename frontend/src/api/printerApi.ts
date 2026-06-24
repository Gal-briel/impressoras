import { httpClient } from './httpClient';
import type { ID, ListResponse, QueryParams } from '../types/api';
import type { Printer } from '../types/printer';

export async function listPrinters(params?: QueryParams): Promise<ListResponse<Printer>> {
  const { data } = await httpClient.get<ListResponse<Printer>>('/printers', { params });
  return data;
}

export async function listAgentPrinters(agentId: ID): Promise<ListResponse<Printer>> {
  const { data } = await httpClient.get<ListResponse<Printer>>(`/agents/${agentId}/printers`);
  return data;
}
