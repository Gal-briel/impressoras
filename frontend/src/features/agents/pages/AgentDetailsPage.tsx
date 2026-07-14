import { ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AgentAdminActionsSection } from '../components/AgentAdminActionsSection';
import { AgentCommandsPanel } from '../components/AgentCommandsPanel';
import { AgentDiagnosticsSection } from '../components/AgentDiagnosticsSection';
import { AgentEventsPanel } from '../components/AgentEventsPanel';
import { AgentGroupAssignmentSection } from '../components/AgentGroupAssignmentSection';
import { AgentHealthSection } from '../components/AgentHealthSection';
import { AgentInfoCard } from '../components/AgentInfoCard';
import { AgentInventorySection } from '../components/AgentInventorySection';
import { AgentOperationalAlertsSection } from '../components/AgentOperationalAlertsSection';
import { AgentPersistedSecurityAlertsSection } from '../components/AgentPersistedSecurityAlertsSection';
import { AgentPrintersPanel } from '../components/AgentPrintersPanel';
import { AgentSecurityHistorySection } from '../components/AgentSecurityHistorySection';
import { AgentSecurityInventorySection } from '../components/AgentSecurityInventorySection';
import { AgentSoftwareChangesSection } from '../components/AgentSoftwareChangesSection';
import { AgentSoftwareInventoryHistorySection } from '../components/AgentSoftwareInventoryHistorySection';
import { AgentUpdateSection } from '../components/AgentUpdateSection';
import { useAgent } from '../hooks/useAgent';

type ExpandableSectionProps = {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function ExpandableSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: ExpandableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full flex-col gap-3 bg-white px-5 py-4 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-950">
              {title}
            </h2>

            {badge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                {badge}
              </span>
            ) : null}
          </div>

          {description ? (
            <p className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          ) : null}
        </div>

        <span className="text-sm font-semibold text-blue-700">
          {isOpen ? 'Recolher' : 'Abrir'}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {children}
        </div>
      ) : null}
    </Card>
  );
}

export function AgentDetailsPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const {
    data: agent,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgent(id);

  async function refreshAgentPage() {
    if (!id) {
      await refetch();
      return;
    }

    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['agents'] }),
      queryClient.invalidateQueries({ queryKey: ['agent', id] }),
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
        description="Informações organizadas por categoria para facilitar a operação."
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

      {isLoading ? (
        <Card className="h-64 animate-pulse bg-slate-100 p-6">
          <div />
        </Card>
      ) : null}

      {isError ? (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar os detalhes do agente.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      ) : null}

      {!isLoading && !isError && agent ? (
        <div className="space-y-4">
          <ExpandableSection
            title="Resumo do agente"
            description="Identificação, sistema operacional, status e dados principais."
            defaultOpen
          >
            <AgentInfoCard agent={agent} />
          </ExpandableSection>

          <ExpandableSection
            title="Empresa / Grupo"
            description="Classificação do agente por empresa, domínio ou grupo manual."
            badge={agent.grouping_status === 'requires_review' ? 'Revisar' : agent.group_name || undefined}
            defaultOpen
          >
            <AgentGroupAssignmentSection agent={agent} />
          </ExpandableSection>

          <ExpandableSection
            title="Alertas operacionais"
            description="Eventos operacionais, falhas e automações vinculadas ao agente."
            defaultOpen
          >
            <AgentOperationalAlertsSection agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Saúde e status"
            description="Informações de saúde, conectividade e estado atual do agente."
          >
            <AgentHealthSection />
          </ExpandableSection>

          <ExpandableSection
            title="Inventário patrimonial"
            description="Dados patrimoniais e informações coletadas do dispositivo."
          >
            <AgentInventorySection />
          </ExpandableSection>

          <ExpandableSection
            title="Hardware"
            description="Diagnóstico técnico e inventário avançado de hardware."
          >
            <AgentDiagnosticsSection />
          </ExpandableSection>

          <ExpandableSection
            title="Segurança"
            description="Inventário de segurança, BitLocker, firewall, antivírus, atualizações e alertas."
          >
            <div className="space-y-4">
              <AgentPersistedSecurityAlertsSection agentId={agent.id} />
              <AgentSecurityInventorySection agentId={agent.id} />
              <AgentSecurityHistorySection agentId={agent.id} />
            </div>
          </ExpandableSection>

          <ExpandableSection
            title="Programas instalados"
            description="Histórico de inventário de softwares instalados."
          >
            <AgentSoftwareInventoryHistorySection agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Mudanças de software"
            description="Softwares adicionados, removidos ou alterados entre coletas."
          >
            <AgentSoftwareChangesSection agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Impressoras"
            description="Impressoras coletadas e ações relacionadas."
          >
            <AgentPrintersPanel agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Comandos"
            description="Comandos enviados especificamente para este agente."
          >
            <AgentCommandsPanel agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Eventos"
            description="Histórico de eventos enviados pelo agente."
          >
            <AgentEventsPanel agentId={agent.id} />
          </ExpandableSection>

          <ExpandableSection
            title="Administração e atualização"
            description="Ações administrativas, atualização e controle do agente."
          >
            <div className="space-y-4">
              <AgentUpdateSection />
              <AgentAdminActionsSection agentId={agent.id} />
            </div>
          </ExpandableSection>
        </div>
      ) : null}
    </section>
  );
}
