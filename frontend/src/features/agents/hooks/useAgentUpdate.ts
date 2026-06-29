import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAgentUpdateCommand,
  type UpdateAgentPayload,
} from '../api/agentUpdateApi';

export function useAgentUpdate(agentId?: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: UpdateAgentPayload) =>
      createAgentUpdateCommand(agentId!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-health', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['agent-diagnostics', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['agent-inventory', agentId] });
    },
  });

  return {
    updateAgent: mutation.mutateAsync,
    isUpdatingAgent: Boolean((mutation as any).isPending || (mutation as any).isLoading),
    updateAgentError: mutation.error,
    updateAgentResult: mutation.data,
  };
}
