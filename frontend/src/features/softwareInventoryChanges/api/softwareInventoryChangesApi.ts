import { api } from '../../../api/httpClient';

export type SoftwareChangeType = 'added' | 'removed' | 'changed';

export type SoftwareChangesSummary = {
  total: number;
  agents_with_changes: number;
  added: number;
  removed: number;
  changed: number;
  last_collected_at?: string | null;
};

export type SoftwareChangesBySource = {
  change_type: SoftwareChangeType;
  source?: string | null;
  total: number;
};

export type SoftwareChangesByAgent = {
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  total: number;
  added: number;
  removed: number;
  changed: number;
  last_collected_at?: string | null;
};

export type SoftwareChangesSummaryResponse = {
  summary: SoftwareChangesSummary;
  by_source: SoftwareChangesBySource[];
  by_agent: SoftwareChangesByAgent[];
};

export type ActiveSoftwareInventoryChange = {
  id: string;
  tenant_id: string;
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  snapshot_id: string;
  previous_snapshot_id?: string | null;
  command_id?: string | null;
  change_type: SoftwareChangeType;
  name: string;
  publisher?: string | null;
  source?: string | null;
  previous_version?: string | null;
  latest_version?: string | null;
  previous_install_date?: string | null;
  latest_install_date?: string | null;
  previous_install_location?: string | null;
  latest_install_location?: string | null;
  metadata?: Record<string, unknown> | null;
  is_active: boolean;
  collected_at?: string | null;
  created_at?: string | null;
};

export type ActiveSoftwareInventoryChangesResponse = {
  items: ActiveSoftwareInventoryChange[];
  total: number;
  limit: number;
  offset: number;
  change_type: string;
  source: string;
  search?: string | null;
};

export async function getSoftwareInventoryChangesSummary() {
  const { data } = await api.get<SoftwareChangesSummaryResponse>(
    '/software-inventory/changes/summary',
  );

  return data;
}

export async function getActiveSoftwareInventoryChanges(params?: {
  change_type?: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    change_type = 'all',
    source = 'all',
    search,
    limit = 10,
    offset = 0,
  } = params || {};

  const { data } = await api.get<ActiveSoftwareInventoryChangesResponse>(
    '/software-inventory/changes/active',
    {
      params: {
        change_type,
        source,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}

export type AgentSoftwareChangesSummaryResponse = {
  summary: Omit<SoftwareChangesSummary, 'agents_with_changes'>;
  by_source: SoftwareChangesBySource[];
};

export async function getAgentSoftwareInventoryChangesSummary(agentId: string) {
  const { data } = await api.get<AgentSoftwareChangesSummaryResponse>(
    `/software-inventory/changes/agents/${agentId}/summary`,
  );

  return data;
}

export async function getAgentActiveSoftwareInventoryChanges(
  agentId: string,
  params?: {
    change_type?: string;
    source?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
) {
  const {
    change_type = 'all',
    source = 'all',
    search,
    limit = 10,
    offset = 0,
  } = params || {};

  const { data } = await api.get<ActiveSoftwareInventoryChangesResponse>(
    `/software-inventory/changes/agents/${agentId}/active`,
    {
      params: {
        change_type,
        source,
        search: search || undefined,
        limit,
        offset,
      },
    },
  );

  return data;
}
