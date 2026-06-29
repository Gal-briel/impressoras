import { useQuery } from '@tanstack/react-query';

import { listCommandHistory, listCommandHistoryAgents } from '../api/commandHistoryApi';

export type CommandHistoryQuery = {
  agentId?: string;
  status?: string;
  limit?: number;
};

export function useCommandHistory(filters: CommandHistoryQuery) {
  return useQuery({
    queryKey: ['command-history', filters],
    queryFn: () => listCommandHistory(filters),
    refetchInterval: 10000,
  });
}

export function useCommandHistoryAgents() {
  return useQuery({
    queryKey: ['command-history', 'agents'],
    queryFn: listCommandHistoryAgents,
    refetchInterval: 30000,
  });
}
