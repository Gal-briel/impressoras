import { useMemo, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { AgentsFilters } from '../components/AgentsFilters';
import { AgentsTable } from '../components/AgentsTable';
import { getAgentDisplayStatus } from '../components/AgentStatusBadge';
import { useAgents } from '../hooks/useAgents';
import type { Agent, AgentStatusFilter } from '../types';

function isAgentOnline(agent: Agent) {
  const status = getAgentDisplayStatus(agent);

  if (status === 'online') {
    return true;
  }

  const lastSeenValue = agent.last_seen || agent.last_seen_at;

  if (!lastSeenValue || status === 'revoked') {
    return false;
  }

  const lastSeen = new Date(lastSeenValue).getTime();

  if (Number.isNaN(lastSeen)) {
    return false;
  }

  return Date.now() - lastSeen <= 2 * 60 * 1000;
}

function matchesSearch(agent: Agent, search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const searchableText = [
    agent.hostname,
    agent.last_ip,
    agent.internal_ip,
    agent.external_ip,
    agent.os_version,
    agent.agent_version,
    agent.mac_address,
    agent.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedSearch);
}

function matchesStatus(agent: Agent, status: AgentStatusFilter) {
  if (status === 'all') {
    return true;
  }

  if (status === 'online') {
    return isAgentOnline(agent);
  }

  if (status === 'offline') {
    return !isAgentOnline(agent) && getAgentDisplayStatus(agent) !== 'revoked';
  }

  return getAgentDisplayStatus(agent) === status;
}

export function AgentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AgentStatusFilter>('all');

  const { data, isLoading, isError, error, refetch, isFetching } = useAgents();

  const agents = data?.items || [];

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      return matchesSearch(agent, search) && matchesStatus(agent, status);
    });
  }, [agents, search, status]);

  const totalAgents = agents.length;
  const onlineAgents = agents.filter(isAgentOnline).length;
  const approvedAgents = agents.filter((agent) => String(agent.enrollment_status || '').toLowerCase() === 'approved').length;
  const revokedAgents = agents.filter((agent) => getAgentDisplayStatus(agent) === 'revoked').length;

  return (
    <section>
      <PageHeader
        title="Agentes"
        description="Gerencie e acompanhe os computadores conectados ao ambiente."
        actions={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total de agentes"
          value={totalAgents}
          description="Cadastrados no tenant"
          icon="🖥️"
        />

        <StatCard
          title="Online"
          value={onlineAgents}
          description="Com check-in recente"
          icon="🟢"
        />

        <StatCard
          title="Aprovados"
          value={approvedAgents}
          description="Liberados para operação"
          icon="✅"
        />

        <StatCard
          title="Revogados"
          value={revokedAgents}
          description="Bloqueados por segurança"
          icon="⛔"
        />
      </div>

      <Card className="mb-6 p-5">
        <AgentsFilters
          search={search}
          status={status}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
        />
      </Card>

      {isError && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar os agentes.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="h-16 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Exibindo <strong>{filteredAgents.length}</strong> de{' '}
            <strong>{totalAgents}</strong> agentes.
          </div>

          <AgentsTable agents={filteredAgents} />
        </>
      )}
    </section>
  );
}
