import { api } from '../../../api/httpClient';
import type {
  Agent,
  AgentGroup,
  AgentTag,
  ApiListResponse,
  DashboardSummary,
} from '../types';

function isAgentOnline(agent: Agent): boolean {
  const status = String(agent.status || agent.enrollment_status || '').toLowerCase();

  if (status.includes('revoked')) {
    return false;
  }

  if (status.includes('online')) {
    return true;
  }

  if (!agent.last_seen_at) {
    return false;
  }

  const lastSeen = new Date(agent.last_seen_at).getTime();

  if (Number.isNaN(lastSeen)) {
    return false;
  }

  const twoMinutes = 2 * 60 * 1000;

  return Date.now() - lastSeen <= twoMinutes;
}

function isAgentOfflineOrRevoked(agent: Agent): boolean {
  return !isAgentOnline(agent);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [agentsResponse, tagsResponse, groupsResponse, commandsResponse] =
    await Promise.allSettled([
      api.get<ApiListResponse<Agent>>('/agents'),
      api.get<ApiListResponse<AgentTag>>('/agent-tags'),
      api.get<ApiListResponse<AgentGroup>>('/agent-groups'),
      api.get<ApiListResponse<{ status?: string }>>('/commands'),
    ]);

  const agents =
    agentsResponse.status === 'fulfilled'
      ? agentsResponse.value.data.items || []
      : [];

  const tags =
    tagsResponse.status === 'fulfilled'
      ? tagsResponse.value.data.items || []
      : [];

  const groups =
    groupsResponse.status === 'fulfilled'
      ? groupsResponse.value.data.items || []
      : [];

  const commands =
    commandsResponse.status === 'fulfilled'
      ? commandsResponse.value.data.items || []
      : [];

  const pendingCommands = commands.filter((command) => {
    const status = String(command.status || '').toLowerCase();
    return ['queued', 'pending', 'dispatched', 'acknowledged', 'executing'].includes(status);
  }).length;

  return {
    totalAgents: agents.length,
    onlineAgents: agents.filter(isAgentOnline).length,
    offlineOrRevokedAgents: agents.filter(isAgentOfflineOrRevoked).length,
    pendingCommands,
    totalTags: tags.length,
    totalGroups: groups.length,
  };
}
