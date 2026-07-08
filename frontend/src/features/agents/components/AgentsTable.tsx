import { Link } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import type { Agent } from '../types';
import { AgentStatusBadge } from './AgentStatusBadge';

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function groupingStatusLabel(agent: Agent) {
  if (agent.grouping_status === 'manual') {
    return 'Manual';
  }

  if (agent.grouping_status === 'auto') {
    return 'Automático';
  }

  if (agent.grouping_status === 'requires_review') {
    return 'Revisar';
  }

  return agent.grouping_status || '-';
}

function groupingStatusClass(agent: Agent) {
  if (agent.grouping_status === 'requires_review') {
    return 'bg-amber-100 text-amber-800 ring-amber-200';
  }

  if (agent.grouping_status === 'manual') {
    return 'bg-blue-100 text-blue-800 ring-blue-200';
  }

  if (agent.grouping_status === 'auto') {
    return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

type AgentsTableProps = {
  agents: Agent[];
  compactGroup?: boolean;
};

export function AgentsTable({ agents, compactGroup = false }: AgentsTableProps) {
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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Hostname
              </th>
              {!compactGroup ? (
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Empresa/Grupo
                </th>
              ) : null}
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sistema
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Versão
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                IP
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Último check-in
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ações
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {agent.hostname || 'Sem hostname'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {agent.mac_address || agent.id}
                    </p>
                  </div>
                </td>

                {!compactGroup ? (
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {agent.group_name || 'Sem grupo'}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {agent.domain_name ? `Domínio: ${agent.domain_name}` : 'Sem domínio detectado'}
                      </p>

                      <span
                        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${groupingStatusClass(
                          agent,
                        )}`}
                      >
                        {groupingStatusLabel(agent)}
                      </span>
                    </div>
                  </td>
                ) : null}

                <td className="px-5 py-4 text-sm text-slate-600">
                  {agent.os_version || '-'}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {agent.agent_version || '-'}
                </td>

                <td className="px-5 py-4">
                  <AgentStatusBadge agent={agent} />
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {agent.last_ip || agent.internal_ip || agent.external_ip || '-'}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {formatDate(agent.last_seen || agent.last_seen_at)}
                </td>

                <td className="px-5 py-4 text-right">
                  <Link
                    to={`/agents/${agent.id}`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Ver detalhes
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
