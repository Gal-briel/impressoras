import type { ID } from './api';
import type { Permission, RoleName } from './rbac';

export type AdminUser = {
  id: ID;
  tenant_id: ID;
  role_id: ID;
  email: string;
  status: string;
  role_name?: string;
  created_at?: string;
};

export type AdminRole = {
  id: ID;
  tenant_id: ID;
  name: RoleName | string;
  description?: string | null;
  permissions: Permission[];
};

export type AdminTenant = {
  id: ID;
  name: string;
  active: boolean;
  created_at?: string;
};
