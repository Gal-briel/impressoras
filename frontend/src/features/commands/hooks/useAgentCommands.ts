import { useQuery } from '@tanstack/react-query';

import { getAgentCommands } from '../api/commandsApi';

export function useAgentCommands(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'commands'],
    queryFn: () => getAgentCommands(agentId || ''),
    enabled: Boolean(agentId),
    refetchInterval: 30000,
  });
}
