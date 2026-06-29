import { useQuery } from '@tanstack/react-query';

import { getDashboardSummary } from '../api/dashboardApi';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 30000,
  });
}
