import { api } from '../../../api/httpClient';
import type { DashboardSummary } from '../types';

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDashboardSummary(data: any): DashboardSummary {
  return {
    totalAgents: numberOrZero(data?.totalAgents ?? data?.total_agents),
    onlineAgents: numberOrZero(data?.onlineAgents ?? data?.online_agents),
    offlineOrRevokedAgents: numberOrZero(
      data?.offlineOrRevokedAgents ??
        data?.offline_or_revoked_agents ??
        data?.offline_agents
    ),
    pendingCommands: numberOrZero(data?.pendingCommands ?? data?.pending_commands),
    totalTags: numberOrZero(data?.totalTags ?? data?.total_tags),
    totalGroups: numberOrZero(data?.totalGroups ?? data?.total_groups),
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get(`/dashboard/summary?_ts=${Date.now()}`);
  const summary = normalizeDashboardSummary(response.data);

  console.info('[dashboard-summary-v2]', summary);

  return summary;
}
