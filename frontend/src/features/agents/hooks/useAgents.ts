import { useQuery } from '@tanstack/react-query';

import { getAgents } from '../api/agentsApi';

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
    refetchInterval: 30000,
  });
}
