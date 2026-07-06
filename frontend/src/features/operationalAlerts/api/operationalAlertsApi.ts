import { api } from '../../../api/httpClient';

export type OperationalAlertSeverity = 'critical' | 'warning' | 'info';
export type OperationalAlertStatus = 'active' | 'resolved' | 'ignored';

export type OperationalAlert = {
  id: string;
  tenant_id: string;
  agent_id?: string | null;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  alert_type: string;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  title: string;
  description?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  dedupe_key: string;
  metadata?: Record<string, unknown> | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;
  ignored_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OperationalAlertsSummary = {
  total: number;
  active: number;
  resolved: number;
  ignored: number;
  active_critical: number;
  active_warning: number;
  active_info: number;
  agents_with_active_alerts: number;
  last_seen_at?: string | null;
};

export type OperationalAlertByType = {
  alert_type: string;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  total: number;
};

export type OperationalAlertByAgent = {
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  total: number;
  active: number;
  resolved: number;
  ignored: number;
  active_critical: number;
  active_warning: number;
  active_info: number;
  last_seen_at?: string | null;
};

export type OperationalAlertsSummaryResponse = {
  summary: OperationalAlertsSummary;
  by_type: OperationalAlertByType[];
  by_agent: OperationalAlertByAgent[];
};

export type OperationalAlertsListResponse = {
  items: OperationalAlert[];
  total: number;
  limit: number;
  offset: number;
  status: string;
  severity: string;
  alert_type: string;
  agent_id?: string | null;
  search?: string | null;
};

export async function getOperationalAlertsSummary() {
  const { data } = await api.get<OperationalAlertsSummaryResponse>(
    '/operational-alerts/summary',
  );

  return data;
}

export async function getOperationalAlerts(params?: {
  status?: string;
  severity?: string;
  alert_type?: string;
  agent_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    status = 'active',
    severity = 'all',
    alert_type = 'all',
    agent_id,
    search,
    limit = 50,
    offset = 0,
  } = params || {};

  const { data } = await api.get<OperationalAlertsListResponse>(
    '/operational-alerts',
    {
      params: {
        status,
        severity,
        alert_type,
        agent_id,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}

export async function resolveOperationalAlert(alertId: string, note?: string) {
  const { data } = await api.post<OperationalAlert>(
    `/operational-alerts/${alertId}/resolve`,
    {
      note: note || null,
    },
  );

  return data;
}

export async function ignoreOperationalAlert(alertId: string, note?: string) {
  const { data } = await api.post<OperationalAlert>(
    `/operational-alerts/${alertId}/ignore`,
    {
      note: note || null,
    },
  );

  return data;
}

export type OfflineAgentsSyncResponse = {
  opened_or_refreshed: number;
  resolved: number;
};


export interface SyncAllOperationalAlertsResponse {
  offline_agents: OfflineAgentsSyncResponse;
  security_alerts: OfflineAgentsSyncResponse;
  software_changes: OfflineAgentsSyncResponse;
  totals: OfflineAgentsSyncResponse;
}

export async function syncOfflineAgentAlerts(offlineAfterMinutes = 15) {
  const { data } = await api.post<OfflineAgentsSyncResponse>(
    '/operational-alerts/sync/offline-agents',
    null,
    {
      params: {
        offline_after_minutes: offlineAfterMinutes,
      },
    },
  );

  return data;
}

export async function syncSoftwareChangeAlerts() {
  const { data } = await api.post<OfflineAgentsSyncResponse>(
    '/operational-alerts/sync/software-changes',
  );

  return data;
}

export async function syncAllOperationalAlerts(offlineAfterMinutes = 15) {
  const { data } = await api.post<SyncAllOperationalAlertsResponse>(
    '/operational-alerts/sync/all',
    undefined,
    {
      params: {
        offline_after_minutes: offlineAfterMinutes,
      },
    },
  );

  return data;
}

