import { api } from '../../../api/httpClient';

export type PersistedSoftwareItem = {
  id: string;
  tenant_id?: string;
  agent_id: string;
  command_id?: string | null;
  name: string;
  version?: string | null;
  publisher?: string | null;
  install_date?: string | null;
  estimated_size_mb?: number | null;
  install_location?: string | null;
  uninstall_string?: string | null;
  registry_key?: string | null;
  source?: string | null;
  user_sid?: string | null;
  collected_at?: string;
  created_at?: string;
};

export type PersistedSoftwareSource = {
  source: string;
  total: number;
};

export type PersistedSoftwareInventoryResponse = {
  items: PersistedSoftwareItem[];
  total: number;
  limit: number;
  offset: number;
  source: string;
  search?: string | null;
};

export type PersistedSoftwareSourcesResponse = {
  items: PersistedSoftwareSource[];
  total: number;
};

export type PersistedSecuritySnapshot = {
  id: string;
  tenant_id?: string;
  agent_id: string;
  command_id?: string | null;
  defender?: Record<string, unknown> | null;
  antivirus?: unknown[];
  bitlocker?: unknown[];
  firewall?: unknown[];
  hotfixes?: unknown[];
  update_services?: unknown[];
  local_users?: unknown[];
  local_groups?: unknown[];
  local_administrators?: unknown[];
  usb_devices?: unknown[];
  monitors?: unknown[];
  recent_software?: unknown[];
  security_score?: number | null;
  critical_alerts?: number | null;
  warning_alerts?: number | null;
  info_alerts?: number | null;
  collected_at?: string;
  created_at?: string;
};

export type PersistedSecuritySnapshotResponse = {
  snapshot: PersistedSecuritySnapshot | null;
};

export type PersistedSecuritySnapshotsResponse = {
  items: PersistedSecuritySnapshot[];
  total: number;
  limit: number;
  offset: number;
};

export async function getPersistedSoftwareSources(agentId: string) {
  const { data } = await api.get<PersistedSoftwareSourcesResponse>(
    `/agents/${agentId}/software-inventory/sources`,
  );

  return data;
}

export async function getPersistedSoftwareInventory(params: {
  agentId: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, source = 'all', search, limit = 100, offset = 0 } = params;

  const { data } = await api.get<PersistedSoftwareInventoryResponse>(
    `/agents/${agentId}/software-inventory`,
    {
      params: {
        source,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}

export async function getLatestPersistedSecuritySnapshot(agentId: string) {
  const { data } = await api.get<PersistedSecuritySnapshotResponse>(
    `/agents/${agentId}/security-snapshot/latest`,
  );

  return data;
}

export async function getPersistedSecuritySnapshots(params: {
  agentId: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, limit = 20, offset = 0 } = params;

  const { data } = await api.get<PersistedSecuritySnapshotsResponse>(
    `/agents/${agentId}/security-snapshots`,
    {
      params: {
        limit,
        offset,
      },
    },
  );

  return data;
}

export type PersistedSoftwareInventorySnapshot = {
  id: string;
  tenant_id?: string;
  agent_id: string;
  command_id?: string | null;
  total_items: number;
  sources?: Array<{ source: string; count: number }> | null;
  raw_counts?: Record<string, number> | null;
  collection_mode?: Record<string, unknown> | null;
  collected_at?: string;
  created_at?: string;
};

export type PersistedSoftwareInventorySnapshotsResponse = {
  items: PersistedSoftwareInventorySnapshot[];
  total: number;
  limit: number;
  offset: number;
};

export type SoftwareInventoryCompareItem = {
  id?: string;
  name: string;
  version?: string | null;
  publisher?: string | null;
  install_date?: string | null;
  source?: string | null;
  collected_at?: string;
};

export type SoftwareInventoryChangedItem = {
  name: string;
  publisher?: string | null;
  source?: string | null;
  previous_version?: string | null;
  latest_version?: string | null;
  previous_install_date?: string | null;
  latest_install_date?: string | null;
  previous_install_location?: string | null;
  latest_install_location?: string | null;
};

export type LatestSoftwareInventoryComparisonResponse = {
  latest_snapshot: PersistedSoftwareInventorySnapshot | null;
  previous_snapshot: PersistedSoftwareInventorySnapshot | null;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  added: SoftwareInventoryCompareItem[];
  removed: SoftwareInventoryCompareItem[];
  changed: SoftwareInventoryChangedItem[];
  limit?: number;
  message?: string;
};

export async function getPersistedSoftwareInventorySnapshots(params: {
  agentId: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, limit = 20, offset = 0 } = params;

  const { data } = await api.get<PersistedSoftwareInventorySnapshotsResponse>(
    `/agents/${agentId}/software-inventory/snapshots`,
    {
      params: {
        limit,
        offset,
      },
    },
  );

  return data;
}

export async function getLatestSoftwareInventoryComparison(params: {
  agentId: string;
  limit?: number;
}) {
  const { agentId, limit = 20 } = params;

  const { data } = await api.get<LatestSoftwareInventoryComparisonResponse>(
    `/agents/${agentId}/software-inventory/compare/latest`,
    {
      params: {
        limit,
      },
    },
  );

  return data;
}

export type SecurityAlertSeverity = 'critical' | 'warning' | 'info';

export type PersistedSecurityAlert = {
  severity: SecurityAlertSeverity;
  title: string;
  description: string;
  category: string;
  metadata?: Record<string, unknown>;
};

export type LatestSecurityAlertsResponse = {
  snapshot: PersistedSecuritySnapshot | null;
  alerts: PersistedSecurityAlert[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
};

export type LatestSecuritySnapshotComparisonResponse = {
  latest_snapshot: PersistedSecuritySnapshot | null;
  previous_snapshot: PersistedSecuritySnapshot | null;
  delta: {
    security_score: number;
    critical_alerts: number;
    warning_alerts: number;
    info_alerts: number;
  };
  message?: string;
};

export async function getLatestSecurityAlerts(agentId: string) {
  const { data } = await api.get<LatestSecurityAlertsResponse>(
    `/agents/${agentId}/security-alerts/latest`,
  );

  return data;
}

export async function getLatestSecuritySnapshotComparison(agentId: string) {
  const { data } = await api.get<LatestSecuritySnapshotComparisonResponse>(
    `/agents/${agentId}/security-snapshot/compare/latest`,
  );

  return data;
}
