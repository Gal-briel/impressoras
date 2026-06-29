import { useQuery } from '@tanstack/react-query';

import { getAgentPrinters } from '../api/printersApi';

export function useAgentPrinters(agentId?: string) {
  return useQuery({
    queryKey: ['agents', agentId, 'printers'],
    queryFn: () => getAgentPrinters(agentId || ''),
    enabled: Boolean(agentId),
    refetchInterval: 30000,
  });
}
