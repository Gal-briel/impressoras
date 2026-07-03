import { useQuery } from '@tanstack/react-query';

import {
  getActiveSoftwareInventoryChanges,
  getAgentActiveSoftwareInventoryChanges,
  getAgentSoftwareInventoryChangesSummary,
  getSoftwareInventoryChangesSummary,
} from '../api/softwareInventoryChangesApi';

export function useSoftwareInventoryChangesSummary() {
  return useQuery({
    queryKey: ['software-inventory-changes', 'summary'],
    queryFn: getSoftwareInventoryChangesSummary,
    staleTime: 30_000,
  });
}

export function useActiveSoftwareInventoryChanges(params?: {
  change_type?: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    change_type = 'all',
    source = 'all',
    search = '',
    limit = 10,
    offset = 0,
  } = params || {};

  return useQuery({
    queryKey: [
      'software-inventory-changes',
      'active',
      change_type,
      source,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getActiveSoftwareInventoryChanges({
        change_type,
        source,
        search,
        limit,
        offset,
      }),
    staleTime: 30_000,
  });
}

export function useAgentSoftwareInventoryChangesSummary(agentId?: string) {
  return useQuery({
    queryKey: ['software-inventory-changes', 'agent-summary', agentId],
    queryFn: () => getAgentSoftwareInventoryChangesSummary(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function useAgentActiveSoftwareInventoryChanges(
  agentId?: string,
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
    search = '',
    limit = 10,
    offset = 0,
  } = params || {};

  return useQuery({
    queryKey: [
      'software-inventory-changes',
      'agent-active',
      agentId,
      change_type,
      source,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getAgentActiveSoftwareInventoryChanges(agentId as string, {
        change_type,
        source,
        search,
        limit,
        offset,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}
