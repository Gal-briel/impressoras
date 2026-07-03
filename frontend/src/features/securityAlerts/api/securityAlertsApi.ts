import { api } from '../../../api/httpClient';

export type SecurityAlertSeverity = 'critical' | 'warning' | 'info';

export type SecurityAlertSummary = {
  total: number;
  agents_with_alerts: number;
  critical: number;
  warning: number;
  info: number;
  last_collected_at?: string | null;
};

export type SecurityAlertByCategory = {
  category: string;
  severity: SecurityAlertSeverity;
  total: number;
};

export type SecurityAlertByAgent = {
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  total: number;
  critical: number;
  warning: number;
  info: number;
  last_collected_at?: string | null;
};

export type SecurityAlertsSummaryResponse = {
  summary: SecurityAlertSummary;
  by_category: SecurityAlertByCategory[];
  by_agent: SecurityAlertByAgent[];
};

export type ActiveSecurityAlert = {
  id: string;
  tenant_id: string;
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  snapshot_id: string;
  command_id?: string | null;
  severity: SecurityAlertSeverity;
  title: string;
  description: string;
  category: string;
  metadata?: Record<string, unknown> | null;
  is_active: boolean;
  collected_at?: string | null;
  created_at?: string | null;
};

export type ActiveSecurityAlertsResponse = {
  items: ActiveSecurityAlert[];
  total: number;
  limit: number;
  offset: number;
  severity: string;
  category: string;
  search?: string | null;
};

export async function getSecurityAlertsSummary() {
  const { data } = await api.get<SecurityAlertsSummaryResponse>(
    '/security-alerts/summary',
  );

  return data;
}

export async function getActiveSecurityAlerts(params?: {
  severity?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { severity = 'all', category = 'all', search, limit = 10, offset = 0 } = params || {};

  const { data } = await api.get<ActiveSecurityAlertsResponse>(
    '/security-alerts/active',
    {
      params: {
        severity,
        category,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}

export type AgentSecurityAlertsSummaryResponse = {
  summary: Omit<SecurityAlertSummary, 'agents_with_alerts'>;
  by_category: SecurityAlertByCategory[];
};

export async function getAgentSecurityAlertsSummary(agentId: string) {
  const { data } = await api.get<AgentSecurityAlertsSummaryResponse>(
    `/security-alerts/agents/${agentId}/summary`,
  );

  return data;
}

export async function getAgentActiveSecurityAlerts(
  agentId: string,
  params?: {
    severity?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
) {
  const { severity = 'all', category = 'all', search, limit = 10, offset = 0 } = params || {};

  const { data } = await api.get<ActiveSecurityAlertsResponse>(
    `/security-alerts/agents/${agentId}/active`,
    {
      params: {
        severity,
        category,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}
