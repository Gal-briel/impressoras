import type { ID } from './api';

export type Printer = {
  id: ID;
  tenant_id: ID;
  agent_id: ID;
  agent_hostname?: string;
  name: string;
  driver?: string;
  port?: string;
  type?: string;
  is_default?: boolean;
  status?: string;
  created_at?: string;
};
