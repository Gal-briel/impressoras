import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../api/httpClient';
import { AgentHealthCard } from './AgentHealthCard';
import { useAgentHealth } from '../hooks/useAgentHealth';
import { createCommandIdempotencyKey } from '../../commands/utils/idempotency';

export function AgentHealthSection() {
  const params = useParams<{ id?: string; agentId?: string }>();
  const agentId = params.agentId || params.id;

  const agentHealthQuery = useAgentHealth(agentId);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  async function runDiagnostics() {
    if (!agentId) return;

    try {
      setIsRunningDiagnostics(true);

      await api.post(`/agents/${agentId}/commands`, {
        command_type: 'collect_diagnostics',
        payload: {},
        idempotency_key: createCommandIdempotencyKey('collect_diagnostics', agentId, 'agent-health'),
        timeout_seconds: 120,
      });

      await agentHealthQuery.refetch();
    } finally {
      setIsRunningDiagnostics(false);
    }
  }

  return (
    <AgentHealthCard
      health={agentHealthQuery.data}
      isLoading={agentHealthQuery.isLoading}
      onRunDiagnostics={runDiagnostics}
      isRunningDiagnostics={isRunningDiagnostics}
    />
  );
}
