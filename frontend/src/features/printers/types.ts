export type PrinterStatus =
  | 'online'
  | 'offline'
  | 'unknown'
  | 'error'
  | 'warning'
  | 'ready'
  | 'paused'
  | string;

export type Printer = {
  id: string;
  tenant_id?: string;
  agent_id?: string;
  agent_hostname?: string | null;
  name?: string;
  printer_name?: string;
  driver_name?: string | null;
  port_name?: string | null;
  share_name?: string | null;
  location?: string | null;
  comment?: string | null;
  status?: PrinterStatus;
  is_default?: boolean;
  is_shared?: boolean;
  is_network?: boolean;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PrintersResponse = {
  items: Printer[];
  total: number;
  warning?: string;
};
