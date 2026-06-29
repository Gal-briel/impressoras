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

type AgentsTableProps = {
  agents: Agent[];
};

export function AgentsTable({ agents }: AgentsTableProps) {
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
                  {formatDate(agent.last_seen_at)}
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
