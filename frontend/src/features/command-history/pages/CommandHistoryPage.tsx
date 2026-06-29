import { useMemo, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { CommandStatusBadge, getCommandDisplayStatus } from '../../commands/components/CommandStatusBadge';
import type { Command } from '../../commands/types';
import { useCommandHistory, useCommandHistoryAgents } from '../hooks/useCommandHistory';

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getCommandType(command: Command) {
  return command.command_type || command.type || '—';
}

function getAgentLabel(command: Command) {
  return command.agent_hostname || command.agent_id || '—';
}

function getCommandError(command: Command) {
  return command.error_message || command.error_code || '—';
}

function getCommandResult(command: Command) {
  const result = command.result ?? command.output ?? null;

  if (result === null || result === undefined || result === '') return '—';
  if (typeof result === 'string') return result;

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function matchesText(command: Command, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;

  const content = [
    command.id,
    command.agent_id,
    command.agent_hostname,
    getCommandType(command),
    command.status,
    command.error_message,
    command.error_code,
    getCommandResult(command),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return content.includes(normalized);
}

function matchesType(command: Command, type: string) {
  if (!type || type === 'all') return true;
  return getCommandType(command) === type;
}

function isPending(command: Command) {
  return ['queued', 'pending', 'dispatched', 'acknowledged', 'executing'].includes(
    getCommandDisplayStatus(command)
  );
}

function isFailed(command: Command) {
  return ['failed', 'timed_out', 'timeout', 'expired', 'error'].includes(
    getCommandDisplayStatus(command)
  );
}

export function CommandHistoryPage() {
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');

  const historyQuery = useCommandHistory({
    agentId: agentId || undefined,
    status,
    limit: 300,
  });
  const agentsQuery = useCommandHistoryAgents();

  const commands = historyQuery.data?.items || [];
  const agents = agentsQuery.data?.items || [];

  const commandTypes = useMemo(() => {
    return Array.from(new Set(commands.map(getCommandType).filter((item) => item !== '—'))).sort();
  }, [commands]);

  const filteredCommands = useMemo(() => {
    return commands.filter((command) => matchesType(command, type) && matchesText(command, search));
  }, [commands, search, type]);

  const total = commands.length;
  const success = commands.filter((command) => getCommandDisplayStatus(command) === 'success').length;
  const pending = commands.filter(isPending).length;
  const failed = commands.filter(isFailed).length;

  return (
    <section>
      <PageHeader
        title="Histórico de comandos"
        description="Audite comandos enviados aos agentes, resultados, erros e datas de execução."
        actions={
          <button
            onClick={() => historyQuery.refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {historyQuery.isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total" value={total} description="Comandos listados" icon="📜" />
        <StatCard title="Pendentes" value={pending} description="Fila ou execução" icon="⏳" />
        <StatCard title="Sucesso" value={success} description="Finalizados com sucesso" icon="✅" />
        <StatCard title="Falhas" value={failed} description="Erro, timeout ou expirado" icon="⚠️" />
      </div>

      <Card className="mb-6 p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Busca</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Comando, agente, erro ou resultado"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Agente</span>
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Todos</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.hostname || agent.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Todos</option>
              <option value="queued">Pendentes</option>
              <option value="executing">Executando</option>
              <option value="success">Sucesso</option>
              <option value="failed">Falhou</option>
              <option value="timed_out">Timeout</option>
              <option value="expired">Expirado</option>
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Todos</option>
              {commandTypes.map((commandType) => (
                <option key={commandType} value={commandType}>
                  {commandType}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {historyQuery.isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Não foi possível carregar o histórico.</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {historyQuery.error instanceof Error ? historyQuery.error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {historyQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="h-16 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : filteredCommands.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-950">Nenhum comando encontrado</h2>
          <p className="mt-2 text-sm text-slate-500">Ajuste os filtros ou envie um comando para começar o histórico.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
            Exibindo <strong>{filteredCommands.length}</strong> de <strong>{total}</strong> comandos.
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Comando</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Agente</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Criado</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Finalizado</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Erro / Resultado</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCommands.map((command) => (
                  <tr key={command.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{getCommandType(command)}</p>
                      <p className="mt-1 text-xs text-slate-500">{command.id}</p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      <p>{getAgentLabel(command)}</p>
                      {command.agent_hostname && command.agent_id ? (
                        <p className="mt-1 text-xs text-slate-400">{command.agent_id}</p>
                      ) : null}
                    </td>

                    <td className="px-5 py-4">
                      <CommandStatusBadge command={command} />
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(command.created_at)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(command.finished_at)}</td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      <p className="max-w-md truncate">{getCommandError(command)}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-blue-600">Ver payload/resultado</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
{JSON.stringify({ payload: command.payload || {}, result: getCommandResult(command) }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
