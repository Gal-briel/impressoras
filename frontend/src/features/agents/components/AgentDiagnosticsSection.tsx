import { useParams } from 'react-router-dom';
import { AgentDiagnosticsPanel } from './AgentDiagnosticsPanel';
import { useAgentDiagnostics } from '../hooks/useAgentDiagnostics';

export function AgentDiagnosticsSection() {
  const params = useParams<{ id?: string; agentId?: string }>();
  const agentId = params.agentId || params.id;

  const diagnosticsQuery = useAgentDiagnostics(agentId);

  async function handleRunDiagnostics() {
    await diagnosticsQuery.runDiagnostics();
  }

  return (
    <AgentDiagnosticsPanel
      diagnostics={diagnosticsQuery.data?.diagnostics}
      latestCommand={diagnosticsQuery.data?.latestCommand}
      failedCommand={diagnosticsQuery.data?.failedCommand}
      isLoading={diagnosticsQuery.isLoading}
      isRunningDiagnostics={diagnosticsQuery.isRunningDiagnostics}
      onRunDiagnostics={handleRunDiagnostics}
    />
  );
}
