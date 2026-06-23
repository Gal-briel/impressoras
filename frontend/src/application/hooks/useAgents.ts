// frontend/src/application/hooks/useAgents.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentService, GetAgentsParams } from '../services/agentService';

export const useAgents = (params: GetAgentsParams) => {
  return useQuery({
    queryKey: ['agents', params],
    queryFn: () => AgentService.getAgents(params),
    placeholderData: (previousData) => previousData,
  });
};

export const useAgentTags = () => {
  return useQuery({
    queryKey: ['agent-tags'],
    queryFn: () => AgentService.getTags(),
  });
};

export const useAgentGroups = () => {
  return useQuery({
    queryKey: ['agent-groups'],
    queryFn: () => AgentService.getGroups(),
  });
};

export const useRevokeAgent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => AgentService.revokeAgent(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

export const useReplaceAgentTags = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, tagIds }: { agentId: string; tagIds: string[] }) =>
      AgentService.replaceAgentTags(agentId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

export const useAssignAgentGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, groupId }: { agentId: string; groupId: string | null }) =>
      AgentService.assignGroup(agentId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
    },
  });
};
