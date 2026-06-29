import { useQuery } from '@tanstack/react-query';

import { getAgentEvents } from '../api/agentEventsApi';

export function useAgentEvents(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'events'],
    queryFn: () => getAgentEvents(agentId || ''),
    enabled: Boolean(agentId),
    refetchInterval: 30000,
  });
}
