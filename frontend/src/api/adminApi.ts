import { api } from './httpClient';

export type AdminUser = {
  id: string;
  tenant_id: string;
  role_id: string;
  role_name?: string;
  email: string;
  status: string;
  created_at?: string;
};

export type AdminRole = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  permissions: string[];
};

export type AdminPermission = {
  id: string;
  name: string;
  description?: string | null;
  area: string;
  action: string;
};

export type AdminTenant = {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
};

export type CreateUserPayload = {
  email: string;
  password: string;
  role_id: string;
  status?: string;
};

export type UpdateUserPayload = {
  email?: string;
  role_id?: string;
  status?: string;
  password?: string;
};

export type CreateRolePayload = {
  name: string;
  description?: string;
  permissions: string[];
};

export type UpdateRolePayload = {
  name?: string;
  description?: string;
  permissions?: string[];
};

export async function listUsers(): Promise<PaginatedResponse<AdminUser>> {
  const { data } = await api.get('/settings/users');
  return data as PaginatedResponse<AdminUser>;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const { data } = await api.post('/settings/users', payload);
  return data as AdminUser;
}

export async function updateUser(userId: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const { data } = await api.patch(`/settings/users/${userId}`, payload);
  return data as AdminUser;
}

export async function listRoles(): Promise<PaginatedResponse<AdminRole>> {
  const { data } = await api.get('/settings/roles');
  return data as PaginatedResponse<AdminRole>;
}

export async function createRole(payload: CreateRolePayload): Promise<AdminRole> {
  const { data } = await api.post('/settings/roles', payload);
  return data as AdminRole;
}

export async function updateRole(roleId: string, payload: UpdateRolePayload): Promise<AdminRole> {
  const { data } = await api.patch(`/settings/roles/${roleId}`, payload);
  return data as AdminRole;
}

export async function listPermissions(): Promise<PaginatedResponse<AdminPermission>> {
  const { data } = await api.get('/settings/permissions');
  return data as PaginatedResponse<AdminPermission>;
}

export async function listTenants(): Promise<PaginatedResponse<AdminTenant>> {
  const { data } = await api.get('/settings/tenants');
  return data as PaginatedResponse<AdminTenant>;
}
