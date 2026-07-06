import {
  useQuery } from '@tanstack/react-query';

import {
  getLatestPersistedSecuritySnapshot,
  getLatestSoftwareInventoryComparison,
  getPersistedSecuritySnapshots,
  getPersistedSoftwareInventory,
  getPersistedSoftwareInventorySnapshots,
  getPersistedSoftwareSources,
  getLatestSecurityAlerts,
  getLatestSecuritySnapshotComparison,
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


export function usePersistedSoftwareInventorySnapshots(params: {
  agentId?: string;
  limit?: number;
  offset?: number;
}) {
  const { agentId, limit = 20, offset = 0 } = params;

  return useQuery({
    queryKey: ['agents', agentId, 'persisted-software-inventory-snapshots', limit, offset],
    queryFn: () =>
      getPersistedSoftwareInventorySnapshots({
        agentId: agentId as string,
        limit,
        offset,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function useLatestSoftwareInventoryComparison(params: {
  agentId?: string;
  limit?: number;
}) {
  const { agentId, limit = 20 } = params;

  return useQuery({
    queryKey: ['agents', agentId, 'latest-software-inventory-comparison', limit],
    queryFn: () =>
      getLatestSoftwareInventoryComparison({
        agentId: agentId as string,
        limit,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}


export function useLatestSecurityAlerts(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'latest-security-alerts'],
    queryFn: () => getLatestSecurityAlerts(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function useLatestSecuritySnapshotComparison(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'latest-security-snapshot-comparison'],
    queryFn: () => getLatestSecuritySnapshotComparison(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}
