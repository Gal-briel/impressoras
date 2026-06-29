import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createCommand, getCommands } from '../api/commandsApi';
import type { CreateCommandPayload } from '../types';

export function useCommands() {
  return useQuery({
    queryKey: ['commands'],
    queryFn: getCommands,
    refetchInterval: 30000,
  });
}

export function useCreateCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCommandPayload) => createCommand(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commands'] });
      queryClient.invalidateQueries({ queryKey: ['agents', variables.agent_id, 'commands'] });
      queryClient.invalidateQueries({ queryKey: ['printers'] });
      queryClient.invalidateQueries({ queryKey: ['agents', variables.agent_id, 'printers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
  });
}
