import { httpClient } from './httpClient';
import type { ID, ListResponse, QueryParams } from '../types/api';
import type { AuditLog } from '../types/audit';

export async function listAuditLogs(params?: QueryParams): Promise<ListResponse<AuditLog>> {
  const { data } = await httpClient.get<ListResponse<AuditLog>>('/audit', { params });
  return data;
}

export async function getAuditLog(id: ID): Promise<AuditLog> {
  const { data } = await httpClient.get<AuditLog>(`/audit/${id}`);
  return data;
}
