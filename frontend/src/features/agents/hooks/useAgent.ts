import { useQuery } from '@tanstack/react-query';

import { getAgentById } from '../api/agentsApi';

export function useAgent(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId],
    queryFn: () => getAgentById(agentId || ''),
    enabled: Boolean(agentId),
    refetchInterval: 30000,
  });
}
