import type { ID } from './api';

export const commandTypes = [
  'restart_spooler',
  'clear_print_queue',
  'collect_inventory',
  'install_printer',
  'restart_service',
] as const;

export type CommandType = (typeof commandTypes)[number] | string;

export type CommandStatus =
  | 'queued'
  | 'dispatched'
  | 'acknowledged'
  | 'executing'
  | 'success'
  | 'failed'
  | 'timed_out'
  | 'expired'
  | 'cancelled'
  | string;

export type Command = {
  id: ID;
  tenant_id: ID;
  agent_id: ID;
  agent_hostname?: string;
  user_id?: ID;
  command_type: CommandType;
  payload?: Record<string, unknown>;
  status: CommandStatus;
  timeout_seconds?: number;
  idempotency_key?: string;
  correlation_id?: string;
  created_at: string;
  expires_at?: string;
  output?: string | null;
  error_code?: string | null;
};

export type CommandCreatePayload = {
  command_type: CommandType;
  payload: Record<string, unknown>;
  timeout_seconds: number;
  idempotency_key: string;
};
