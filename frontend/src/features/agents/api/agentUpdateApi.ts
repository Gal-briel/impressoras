import { api } from '../../../api/httpClient';

export type UpdateAgentPayload = {
  package_url: string;
  sha256?: string;
  version?: string;
  task_name?: string;
};

export type UpdateAgentCommandResponse = {
  id?: string;
  command_id?: string;
  status?: string;
  command_type?: string;
  type?: string;
};

export async function createAgentUpdateCommand(
  agentId: string,
  payload: UpdateAgentPayload
): Promise<UpdateAgentCommandResponse> {
  const response = await api.post<UpdateAgentCommandResponse>(
    `/agents/${agentId}/commands`,
    {
      idempotency_key: `update-agent-${agentId}-${Date.now()}`,
      command_type: 'update_agent',
      payload,
    }
  );

  return response.data;
}
