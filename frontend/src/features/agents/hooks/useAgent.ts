import { useQuery } from '@tanstack/react-query';

import { getAgentById } from '../api/agentsApi';

export function useAgent(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId],
    queryFn: () => getAgentById(agentId || ''),
    enabled: Boolean(agentId),
    staleTime: 0,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
