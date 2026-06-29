export type ApiListResponse<T> = {
  items: T[];
  total: number;
};

export type CommandStatus =
  | 'queued'
  | 'pending'
  | 'dispatched'
  | 'acknowledged'
  | 'executing'
  | 'success'
  | 'failed'
  | 'timed_out'
  | 'timeout'
  | 'expired'
  | string;

export type CommandType =
  | 'restart_spooler'
  | 'clear_print_queue'
  | 'collect_inventory'
  | 'collect_diagnostics' | 'update_agent'
  | 'install_printer'
  | 'restart_service'
  | 'set_default_printer'
  | 'remove_printer'
  | 'print_test_page';

export type Command = {
  id: string;
  tenant_id?: string;
  agent_id?: string;
  agent_hostname?: string | null;
  command_type?: CommandType | string;
  type?: CommandType | string;
  status?: CommandStatus;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | string | null;
  output?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  dispatched_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  expires_at?: string | null;
};

export type CommandStatusFilter =
  | 'all'
  | 'queued'
  | 'executing'
  | 'success'
  | 'failed'
  | 'timed_out'
  | 'expired';

export type CreateCommandPayload = {
  agent_id: string;
  command_type: CommandType;
  payload?: Record<string, unknown>;
};
