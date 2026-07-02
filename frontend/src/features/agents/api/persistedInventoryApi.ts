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
