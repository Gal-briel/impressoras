import { httpClient } from './httpClient';
import type { ListResponse, ID } from '../types/api';
import type { AdminRole, AdminTenant, AdminUser } from '../types/admin';

export async function listUsers(): Promise<ListResponse<AdminUser>> {
  const { data } = await httpClient.get<ListResponse<AdminUser>>('/settings/users');
  return data;
}

export async function createUser(payload: { email: string; password: string; role_id: ID; status?: string }): Promise<AdminUser> {
  const { data } = await httpClient.post<AdminUser>('/settings/users', payload);
  return data;
}

export async function updateUser(id: ID, payload: Partial<{ email: string; role_id: ID; status: string }>): Promise<AdminUser> {
  const { data } = await httpClient.patch<AdminUser>(`/settings/users/${id}`, payload);
  return data;
}

export async function listRoles(): Promise<ListResponse<AdminRole>> {
  const { data } = await httpClient.get<ListResponse<AdminRole>>('/settings/roles');
  return data;
}

export async function listTenants(): Promise<ListResponse<AdminTenant>> {
  const { data } = await httpClient.get<ListResponse<AdminTenant>>('/settings/tenants');
  return data;
}
