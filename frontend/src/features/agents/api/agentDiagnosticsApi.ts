import { api } from '../../../api/httpClient';

export type AgentCommandSummary = {
  id: string;
  command_type?: string;
  type?: string;
  status?: string;
  output?: string | null;
  result?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DiagnosticPrinter = {
  name?: string;
  driver_name?: string;
  port_name?: string;
  status?: string;
  is_default?: boolean;
  is_shared?: boolean;
  is_network?: boolean;
  is_online?: boolean;
};

export type DiagnosticsData = {
  hostname?: string;
  user?: string;
  domain?: string;
  os?: {
    system?: string;
    release?: string;
    version?: string;
    machine?: string;
    processor?: string;
  };
  network?: {
    internal_ip?: string | null;
  };
  cpu?: {
    count_logical?: number;
    count_physical?: number;
    percent?: number;
  };
  memory?: {
    total_gb?: number;
    available_gb?: number;
    used_gb?: number;
    percent?: number;
  };
  disks?: Array<{
    device?: string;
    mountpoint?: string;
    fstype?: string;
    total_gb?: number;
    used_gb?: number;
    free_gb?: number;
    percent?: number;
  }>;
  uptime?: {
    boot_time_epoch?: number;
    uptime_seconds?: number;
  };
  spooler?: {
    status?: string;
  };
  printers?: {
    count?: number;
    error?: string | null;
    items?: DiagnosticPrinter[];
  };
  hardware?: Record<string, any>;
};

export type LatestDiagnosticsResult = {
  latestCommand?: AgentCommandSummary;
  diagnostics?: DiagnosticsData;
  pendingCommand?: AgentCommandSummary;
  failedCommand?: AgentCommandSummary;
};

function getCommandType(command: AgentCommandSummary) {
  return command.command_type || command.type || '';
}

function parseDiagnostics(command?: AgentCommandSummary): DiagnosticsData | undefined {
  if (!command) return undefined;

  const raw = command.output || command.result;

  if (!raw) return undefined;

  if (typeof raw !== 'string') return raw as DiagnosticsData;

  try {
    return JSON.parse(raw) as DiagnosticsData;
  } catch {
    return undefined;
  }
}

export async function getAgentCommands(agentId: string): Promise<AgentCommandSummary[]> {
  const response = await api.get(`/agents/${agentId}/commands`);
  const data = response.data;

  if (Array.isArray(data)) return data;

  return (data as { items?: AgentCommandSummary[] }).items || [];
}

export async function getLatestAgentDiagnostics(agentId: string): Promise<LatestDiagnosticsResult> {
  const commands = await getAgentCommands(agentId);

  const diagnosticsCommands = commands.filter(
    (command) => getCommandType(command) === 'collect_diagnostics'
  );

  const pendingCommand = diagnosticsCommands.find((command) =>
    ['queued', 'dispatched', 'acknowledged', 'executing', 'pending'].includes(
      String(command.status || '').toLowerCase()
    )
  );

  const latestSuccess = diagnosticsCommands.find((command) => {
    const status = String(command.status || '').toLowerCase();
    return status === 'success' && Boolean(parseDiagnostics(command));
  });

  const latestFailed = diagnosticsCommands.find((command) => {
    const status = String(command.status || '').toLowerCase();
    return ['failed', 'timed_out', 'timeout'].includes(status);
  });

  return {
    latestCommand: latestSuccess,
    diagnostics: parseDiagnostics(latestSuccess),
    pendingCommand,
    failedCommand: latestFailed,
  };
}

export async function createDiagnosticsCommand(agentId: string) {
  const response = await api.post(`/agents/${agentId}/commands`, {
    command_type: 'collect_diagnostics',
    payload: {},
    idempotency_key: `diagnostics-${Date.now()}`,
    timeout_seconds: 120,
  });

  return response.data;
}
