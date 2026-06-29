import { api } from '../../../api/httpClient';

export type BulkAgent = {
  id: string;
  hostname?: string | null;
  name?: string | null;
  status?: string | null;
  last_seen?: string | null;
  agent_version?: string | null;
  [key: string]: any;
};

export type BulkCommandType =
  | 'collect_diagnostics'
  | 'restart_spooler'
  | 'clear_print_queue'
  | 'update_agent';

export type BulkCommandPayload = {
  command_type: BulkCommandType;
  payload?: Record<string, any>;
};

export type BulkCommandResult = {
  agent_id: string;
  agent_name: string;
  ok: boolean;
  command_id?: string;
  status?: string;
  error?: string;
};

function normalizeAgentsResponse(data: any): BulkAgent[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.agents)) return data.agents;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function normalizeCommandsResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.commands)) return data.commands;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function getAgentName(agent: BulkAgent) {
  return agent.hostname || agent.name || agent.id;
}

function getErrorMessage(error: any) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || JSON.stringify(item))
      .join(' | ');
  }

  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }

  return error?.message || 'Erro desconhecido';
}

export function isFinalBulkStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();

  return ['success', 'failed', 'timed_out', 'cancelled', 'canceled', 'error'].includes(
    normalized
  );
}

function normalizeCommandStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed') return 'success';
  if (normalized === 'failure') return 'failed';
  if (normalized === 'timeout') return 'timed_out';

  return normalized || 'pending';
}

function getCommandError(command: any) {
  return (
    command?.error ||
    command?.stderr ||
    command?.error_message ||
    command?.result?.error ||
    command?.output?.error ||
    null
  );
}

export async function listBulkAgents(): Promise<BulkAgent[]> {
  const response = await api.get('/agents');
  return normalizeAgentsResponse(response.data);
}

export async function createAgentCommand(
  agentId: string,
  command: BulkCommandPayload
) {
  const response = await api.post(`/agents/${agentId}/commands`, {
    idempotency_key: `bulk-${command.command_type}-${agentId}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
    command_type: command.command_type,
    payload: command.payload || {},
  });

  return response.data;
}

export async function createBulkCommands(
  agents: BulkAgent[],
  command: BulkCommandPayload
): Promise<BulkCommandResult[]> {
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      const response = await createAgentCommand(agent.id, command);

      return {
        agent_id: agent.id,
        agent_name: getAgentName(agent),
        ok: true,
        command_id: response?.id || response?.command_id,
        status: normalizeCommandStatus(response?.status || 'pending'),
      } satisfies BulkCommandResult;
    })
  );

  return results.map((result, index) => {
    const agent = agents[index];

    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      agent_id: agent.id,
      agent_name: getAgentName(agent),
      ok: false,
      status: 'failed',
      error: getErrorMessage(result.reason),
    };
  });
}

export async function refreshBulkCommandResults(
  results: BulkCommandResult[]
): Promise<BulkCommandResult[]> {
  const refreshed = await Promise.allSettled(
    results.map(async (result) => {
      if (!result.command_id) return result;

      if (isFinalBulkStatus(result.status)) return result;

      const response = await api.get(`/agents/${result.agent_id}/commands`);
      const commands = normalizeCommandsResponse(response.data);

      const command = commands.find((item) => item?.id === result.command_id);

      if (!command) {
        return result;
      }

      const status = normalizeCommandStatus(command.status);

      return {
        ...result,
        status,
        ok: !['failed', 'timed_out', 'cancelled', 'canceled', 'error'].includes(status),
        error: getCommandError(command) || result.error,
      };
    })
  );

  return refreshed.map((item, index) => {
    if (item.status === 'fulfilled') return item.value;

    return {
      ...results[index],
      ok: false,
      status: 'failed',
      error: getErrorMessage(item.reason),
    };
  });
}
