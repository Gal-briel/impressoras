export type RealtimeConnectionStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type RealtimeEvent = {
  tenant_id?: string;
  type: string;
  data?: {
    agent_id?: string;
    command_id?: string;
    event_id?: string;
    status?: string;
    [key: string]: unknown;
  };
};
