import type { ID } from './api';
import type { Permission, RoleName } from './rbac';

export type Role = {
  id: ID;
  name: RoleName | string;
  permissions: Permission[];
};

export type Tenant = {
  id: ID;
  name: string;
  active?: boolean;
};

export type User = {
  id: ID;
  email: string;
  tenant_id: ID;
  status?: string;
  role: Role;
  tenant?: Tenant;
};

export type LoginPayload = {
  email: string;
  password: string;
  tenant_id?: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer' | string;
  expires_in?: number;
};

export type LoginResponse = AuthTokens & {
  user: User;
};
