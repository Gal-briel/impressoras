import { useQuery } from '@tanstack/react-query';
import { getAgentHealth } from '../api/agentHealthApi';

export function useAgentHealth(agentId?: string) {
  return useQuery({
    queryKey: ['agent-health', agentId],
    queryFn: () => getAgentHealth(agentId!),
    enabled: Boolean(agentId),
    refetchInterval: 10000,
  });
}
