import { useMemo, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { AgentsFilters } from '../components/AgentsFilters';
import { AgentsGroupedView } from '../components/AgentsGroupedView';
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
    agent.group_name,
    agent.domain_name,
    agent.grouping_status,
    agent.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedSearch);
}

function isRevokedAgent(agent: Agent) {
  return Boolean(agent.revoked_at) || getAgentDisplayStatus(agent) === 'revoked';
}

function matchesStatus(agent: Agent, status: AgentStatusFilter) {
  if (status === 'all') {
    return !isRevokedAgent(agent);
  }

  if (status === 'online') {
    return isAgentOnline(agent);
  }

  if (status === 'offline') {
    return !isAgentOnline(agent) && !isRevokedAgent(agent);
  }

  return getAgentDisplayStatus(agent) === status;
}

function getAgentGroupKey(agent: Agent) {
  if (agent.grouping_status === 'manual' && agent.group_id) {
    return `manual:${agent.group_id}`;
  }

  if (agent.domain_name) {
    return `domain:${agent.domain_name}`;
  }

  if (agent.group_id && agent.group_name && agent.group_name !== 'Sem domínio') {
    return `group:${agent.group_id}`;
  }

  return 'sem-dominio';
}

function getAgentGroupName(agent: Agent) {
  if (agent.grouping_status === 'manual' && agent.group_name) {
    return agent.group_name;
  }

  if (agent.domain_name) {
    return agent.domain_name;
  }

  if (agent.group_name && agent.group_name !== 'Sem domínio') {
    return agent.group_name;
  }

  return 'Sem domínio';
}

export function AgentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AgentStatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState('all');

  const { data, isLoading, isError, error, refetch, isFetching } = useAgents();

  const agents = data?.items || [];

  const groupOptions = useMemo(() => {
    const groups = new Map<string, string>();

    for (const agent of agents) {
      if (!matchesStatus(agent, status)) {
        continue;
      }

      groups.set(getAgentGroupKey(agent), getAgentGroupName(agent));
    }

    return Array.from(groups.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesGroup =
        groupFilter === 'all' || getAgentGroupKey(agent) === groupFilter;

      return (
        matchesGroup &&
        matchesSearch(agent, search) &&
        matchesStatus(agent, status)
      );
    });
  }, [agents, search, status, groupFilter]);

  const totalAgents = agents.length;
  const onlineAgents = agents.filter(isAgentOnline).length;
  const approvedAgents = agents.filter(
    (agent) => String(agent.enrollment_status || '').toLowerCase() === 'approved',
  ).length;
  const revokedAgents = agents.filter(
    (agent) => getAgentDisplayStatus(agent) === 'revoked',
  ).length;
  const groupsTotal = groupOptions.length;
  const reviewAgents = agents.filter(
    (agent) =>
      agent.grouping_status === 'requires_review' &&
      !agent.domain_name &&
      !isRevokedAgent(agent),
  ).length;

  return (
    <section>
      <PageHeader
        title="Agentes"
        description="Gerencie os computadores conectados, organizados por empresa ou grupo."
        actions={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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

        <StatCard
          title="Empresas/grupos"
          value={groupsTotal}
          description="Agrupamentos ativos"
          icon="🏢"
        />

        <StatCard
          title="A revisar"
          value={reviewAgents}
          description="Sem domínio detectado"
          icon="⚠️"
        />
      </div>

      <Card className="mb-6 p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
          <AgentsFilters
            search={search}
            status={status}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
          />

          <label className="text-sm font-medium text-slate-700">
            Empresa/Grupo
            <select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Todos os grupos</option>

              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            <strong>{totalAgents}</strong> agentes em{' '}
            <strong>
              {groupFilter === 'all' ? groupOptions.length : 1}
            </strong>{' '}
            grupo(s).
          </div>

          <AgentsGroupedView agents={filteredAgents} />
        </>
      )}
    </section>
  );
}
