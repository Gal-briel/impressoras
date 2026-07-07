import { useQuery } from '@tanstack/react-query';

import {
  getAuditActivityReport,
  getCommandsReport,
  getOperationalAlertsReport,
  getReportsOverview,
} from '../api/reportsApi';

export function useReportsOverview(days: number) {
  return useQuery({
    queryKey: ['reports', 'overview', days],
    queryFn: () => getReportsOverview({ days }),
  });
}

export function useOperationalAlertsReport(days: number) {
  return useQuery({
    queryKey: ['reports', 'operational-alerts', days],
    queryFn: () => getOperationalAlertsReport({ days }),
  });
}

export function useCommandsReport(days: number) {
  return useQuery({
    queryKey: ['reports', 'commands', days],
    queryFn: () => getCommandsReport({ days }),
  });
}

export function useAuditActivityReport(days: number) {
  return useQuery({
    queryKey: ['reports', 'audit-activity', days],
    queryFn: () => getAuditActivityReport({ days }),
  });
}
