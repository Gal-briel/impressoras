import { useQuery } from '@tanstack/react-query';

import {
  getActiveSecurityAlerts,
  getAgentActiveSecurityAlerts,
  getAgentSecurityAlertsSummary,
  getSecurityAlertsSummary,
} from '../api/securityAlertsApi';

export function useSecurityAlertsSummary() {
  return useQuery({
    queryKey: ['security-alerts', 'summary'],
    queryFn: getSecurityAlertsSummary,
    staleTime: 30_000,
  });
}

export function useActiveSecurityAlerts(params?: {
  severity?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { severity = 'all', category = 'all', search = '', limit = 10, offset = 0 } = params || {};

  return useQuery({
    queryKey: ['security-alerts', 'active', severity, category, search, limit, offset],
    queryFn: () =>
      getActiveSecurityAlerts({
        severity,
        category,
        search,
        limit,
        offset,
      }),
    staleTime: 30_000,
  });
}

export function useAgentSecurityAlertsSummary(agentId?: string) {
  return useQuery({
    queryKey: ['security-alerts', 'agent-summary', agentId],
    queryFn: () => getAgentSecurityAlertsSummary(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}

export function useAgentActiveSecurityAlerts(
  agentId?: string,
  params?: {
    severity?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
) {
  const { severity = 'all', category = 'all', search = '', limit = 10, offset = 0 } = params || {};

  return useQuery({
    queryKey: [
      'security-alerts',
      'agent-active',
      agentId,
      severity,
      category,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getAgentActiveSecurityAlerts(agentId as string, {
        severity,
        category,
        search,
        limit,
        offset,
      }),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  });
}
