import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createDiagnosticsCommand,
  getLatestAgentDiagnostics,
} from '../api/agentDiagnosticsApi';

export function useAgentDiagnostics(agentId?: string) {
  const query = useQuery({
    queryKey: ['agent-diagnostics', agentId],
    queryFn: () => getLatestAgentDiagnostics(agentId!),
    enabled: Boolean(agentId),
    refetchInterval: 10000,
  });

  const mutation = useMutation({
    mutationFn: () => createDiagnosticsCommand(agentId!),
    onSuccess: async () => {
      await query.refetch();

      setTimeout(() => {
        query.refetch();
      }, 4000);

      setTimeout(() => {
        query.refetch();
      }, 9000);
    },
  });

  return {
    ...query,
    runDiagnostics: mutation.mutateAsync,
    isRunningDiagnostics: mutation.isPending || Boolean(query.data?.pendingCommand),
  };
}
