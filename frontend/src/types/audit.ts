import type { ID } from './api';

export type AuditLog = {
  id: ID;
  tenant_id: ID;
  user_id?: ID;
  user_email?: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata_payload?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
};
