import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getAgentInventory,
  refreshAgentInventoryFromLatestDiagnostics,
} from '../api/agentInventoryApi';

export function useAgentInventory(agentId?: string) {
  const query = useQuery({
    queryKey: ['agent-inventory', agentId],
    queryFn: () => getAgentInventory(agentId!),
    enabled: Boolean(agentId),
  });

  const mutation = useMutation({
    mutationFn: () => refreshAgentInventoryFromLatestDiagnostics(agentId!),
    onSuccess: async () => {
      await query.refetch();
    },
  });

  return {
    ...query,
    inventory: query.data?.inventory,
    refreshInventory: mutation.mutateAsync,
    isRefreshingInventory: mutation.isPending,
    refreshError: mutation.error,
  };
}
