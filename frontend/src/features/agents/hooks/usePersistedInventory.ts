import { useQuery } from '@tanstack/react-query';

import {
  getLatestPersistedSecuritySnapshot,
  getPersistedSecuritySnapshots,
  getPersistedSoftwareInventory,
  getPersistedSoftwareSources,
} from '../api/persistedInventoryApi';

export function usePersistedSoftwareSources(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'persisted-software-sources'],
    queryFn: () => getPersistedSoftwareSources(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function usePersistedSoftwareInventory(params: {
  agentId?: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, source = 'all', search = '', limit = 100, offset = 0 } = params;

  return useQuery({
    queryKey: [
      'agents',
      agentId,
      'persisted-software-inventory',
      source,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getPersistedSoftwareInventory({
        agentId: agentId as string,
        source,
        search,
        limit,
        offset,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function useLatestPersistedSecuritySnapshot(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'persisted-security-snapshot-latest'],
    queryFn: () => getLatestPersistedSecuritySnapshot(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function usePersistedSecuritySnapshots(params: {
  agentId?: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, limit = 20, offset = 0 } = params;

  return useQuery({
    queryKey: ['agents', agentId, 'persisted-security-snapshots', limit, offset],
    queryFn: () =>
      getPersistedSecuritySnapshots({
        agentId: agentId as string,
        limit,
        offset,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}
