import { useMemo, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import type { Agent } from '../types';
import { getAgentDisplayStatus } from './AgentStatusBadge';
import { AgentsTable } from './AgentsTable';

function isAgentOnline(agent: Agent) {
  return getAgentDisplayStatus(agent) === 'online';
}

function groupKey(agent: Agent) {
  return agent.group_id || agent.group_name || 'sem-grupo';
}

function groupName(agent: Agent) {
  return agent.group_name || 'Sem grupo';
}

type AgentsGroupedViewProps = {
  agents: Agent[];
};

export function AgentsGroupedView({ agents }: AgentsGroupedViewProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, Agent[]>();

    for (const agent of agents) {
      const key = groupKey(agent);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)?.push(agent);
    }

    return Array.from(grouped.entries())
      .map(([key, groupAgents]) => {
        const firstAgent = groupAgents[0];

        return {
          key,
          name: firstAgent ? groupName(firstAgent) : 'Sem grupo',
          domain: firstAgent?.domain_name || null,
          agents: groupAgents.sort((a, b) =>
            String(a.hostname || '').localeCompare(String(b.hostname || '')),
          ),
          total: groupAgents.length,
          online: groupAgents.filter(isAgentOnline).length,
          review: groupAgents.filter(
            (agent) => agent.grouping_status === 'requires_review',
          ).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  if (agents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-950">
          Nenhum agente encontrado
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Ajuste os filtros ou aguarde o próximo check-in dos agentes.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups[group.key] ?? false;

        return (
          <Card key={group.key} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex w-full flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-950">
                    {group.name}
                  </span>

                  {group.review > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {group.review} para revisar
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  {group.domain
                    ? `Domínio detectado: ${group.domain}`
                    : group.name === 'Sem domínio'
                      ? 'Agentes sem domínio detectado'
                      : 'Grupo definido manualmente'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  Total: {group.total}
                </span>

                <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  Online: {group.online}
                </span>

                <span className="text-sm font-semibold text-blue-700">
                  {isCollapsed ? 'Abrir grupo' : 'Fechar grupo'}
                </span>
              </div>
            </button>

            {!isCollapsed ? (
              <div className="p-4">
                <AgentsTable agents={group.agents} compactGroup />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
