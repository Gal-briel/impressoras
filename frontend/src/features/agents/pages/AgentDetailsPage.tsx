import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AgentCommandsPanel } from '../components/AgentCommandsPanel';
import { AgentDetailsTabs, type TabKey } from '../components/AgentDetailsTabs';
import { AgentEventsPanel } from '../components/AgentEventsPanel';
import { AgentInfoCard } from '../components/AgentInfoCard';
import { AgentPrintersPanel } from '../components/AgentPrintersPanel';
import { useAgent } from '../hooks/useAgent';
import { AgentHealthSection } from '../components/AgentHealthSection';
import { AgentDiagnosticsSection } from '../components/AgentDiagnosticsSection';
import { AgentInventorySection } from '../components/AgentInventorySection';
import { AgentUpdateSection } from '../components/AgentUpdateSection';
import { AgentAdminActionsSection } from '../components/AgentAdminActionsSection';
import { AgentSecurityInventorySection } from '../components/AgentSecurityInventorySection';

function PlaceholderTabContent({
  title,
  description,
}: {
  title: string;
  description: string;
}) {

return (
    <Card className="p-6">
      <Badge variant="info">Preparado</Badge>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </Card>
  );
}

export function AgentDetailsPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  const { data: agent, isLoading, isError, error, refetch, isFetching } = useAgent(id);

  async function refreshAgentPage() {
    if (!id) {
      await refetch();
      return;
    }

    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['agents'] }),
      queryClient.invalidateQueries({ queryKey: ['agents', id] }),
      queryClient.invalidateQueries({ queryKey: ['agent-health', id] }),
      queryClient.invalidateQueries({ queryKey: ['agent-diagnostics', id] }),
      queryClient.invalidateQueries({ queryKey: ['agent-inventory', id] }),
      queryClient.invalidateQueries({ queryKey: ['agents', id, 'events'] }),
      queryClient.invalidateQueries({ queryKey: ['printers'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-devices'] }),
    ]);

    await queryClient.refetchQueries({
      type: 'active',
    });
  }

  return (
    <section>
      <PageHeader
        title="Detalhes do Agente"
        description="Visão centralizada do agente selecionado."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/agents"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Voltar
            </Link>

            <button
              onClick={refreshAgentPage}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {isFetching ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        }
      />

      {isLoading && (
        <Card className="h-64 animate-pulse bg-slate-100 p-6">
          <div />
        </Card>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar os detalhes do agente.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {!isLoading && !isError && agent && (
        <div className="space-y-6">
          <AgentInfoCard agent={agent} />

        <AgentHealthSection />

        <AgentUpdateSection />

        <AgentAdminActionsSection agentId={agent.id} />

        <AgentSecurityInventorySection agentId={agent.id} />

        <AgentInventorySection />

        <AgentDiagnosticsSection />

          <Card className="p-6">
            <AgentDetailsTabs activeTab={activeTab} onChange={setActiveTab} />

            <div className="mt-6">
              {activeTab === 'general' && (
                <PlaceholderTabContent
                  title="Resumo geral do agente"
                  description="As informações principais já estão carregadas acima. Esta aba ficará reservada para inventário expandido, capacidades do agente e metadados operacionais."
                />
              )}

              {activeTab === 'printers' && (
                <AgentPrintersPanel agentId={agent.id} />
              )}

              {activeTab === 'events' && (
                <AgentEventsPanel agentId={agent.id} />
              )}

              {activeTab === 'commands' && (
                <AgentCommandsPanel agentId={agent.id} />
              )}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
