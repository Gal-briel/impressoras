import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getOperationalAlerts,
  getOperationalAlertsSummary,
  ignoreOperationalAlert,
  resolveOperationalAlert,
  syncOfflineAgentAlerts,
  syncSoftwareChangeAlerts,
} from '../api/operationalAlertsApi';

export function useOperationalAlertsSummary() {
  return useQuery({
    queryKey: ['operational-alerts', 'summary'],
    queryFn: getOperationalAlertsSummary,
    staleTime: 30_000,
  });
}

export function useOperationalAlerts(params?: {
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
    agent_id = '',
    search = '',
    limit = 50,
    offset = 0,
  } = params || {};

  return useQuery({
    queryKey: [
      'operational-alerts',
      'list',
      status,
      severity,
      alert_type,
      agent_id,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getOperationalAlerts({
        status,
        severity,
        alert_type,
        agent_id: agent_id || undefined,
        search,
        limit,
        offset,
      }),
    staleTime: 30_000,
  });
}

export function useResolveOperationalAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, note }: { alertId: string; note?: string }) =>
      resolveOperationalAlert(alertId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational-alerts'] });
    },
  });
}

export function useIgnoreOperationalAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, note }: { alertId: string; note?: string }) =>
      ignoreOperationalAlert(alertId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational-alerts'] });
    },
  });
}


export function useSyncOfflineAgentAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ offlineAfterMinutes }: { offlineAfterMinutes?: number }) =>
      syncOfflineAgentAlerts(offlineAfterMinutes ?? 15),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational-alerts'] });
    },
  });
}

export function useSyncSoftwareChangeAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncSoftwareChangeAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational-alerts'] });
    },
  });
}

