import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { CommandForm } from '../components/CommandForm';
import { getCommandDisplayStatus } from '../components/CommandStatusBadge';
import { CommandsTable } from '../components/CommandsTable';
import { useAgentCommands } from '../hooks/useAgentCommands';
import { useCommands, useCreateCommand } from '../hooks/useCommands';
import type { Command, CommandStatusFilter, CreateCommandPayload } from '../types';

function isPending(command: Command) {
  const status = getCommandDisplayStatus(command);

  return ['queued', 'pending', 'dispatched', 'acknowledged', 'executing'].includes(status);
}

function isFailed(command: Command) {
  const status = getCommandDisplayStatus(command);

  return ['failed', 'timed_out', 'timeout', 'expired'].includes(status);
}

function normalizeStatusFilter(value: string | null): CommandStatusFilter {
  const allowed: CommandStatusFilter[] = [
    'all',
    'queued',
    'executing',
    'success',
    'failed',
    'timed_out',
    'expired',
  ];

  if (value && allowed.includes(value as CommandStatusFilter)) {
    return value as CommandStatusFilter;
  }

  return 'all';
}

function matchesStatus(command: Command, status: CommandStatusFilter) {
  if (status === 'all') {
    return true;
  }

  const currentStatus = getCommandDisplayStatus(command);

  if (status === 'queued') {
    return ['queued', 'pending', 'dispatched', 'acknowledged'].includes(currentStatus);
  }

  if (status === 'timed_out') {
    return ['timed_out', 'timeout'].includes(currentStatus);
  }

  return currentStatus === status;
}

export function CommandsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAgentId = searchParams.get('agent_id') || '';
  const selectedStatus = normalizeStatusFilter(searchParams.get('status'));

  const [statusFilter, setStatusFilter] = useState<CommandStatusFilter>(selectedStatus);
  const [successMessage, setSuccessMessage] = useState('');

  const allCommandsQuery = useCommands();
  const agentCommandsQuery = useAgentCommands(selectedAgentId || undefined);
  const activeCommandsQuery = selectedAgentId ? agentCommandsQuery : allCommandsQuery;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = activeCommandsQuery;

  const createCommandMutation = useCreateCommand();

  useEffect(() => {
    setStatusFilter(selectedStatus);
  }, [selectedStatus]);

  const commands = data?.items || [];

  const filteredCommands = useMemo(() => {
    return commands.filter((command) => matchesStatus(command, statusFilter));
  }, [commands, statusFilter]);

  async function handleCreateCommand(payload: CreateCommandPayload) {
    setSuccessMessage('');

    await createCommandMutation.mutateAsync(payload);
    await refetch();

    setSuccessMessage('Comando enviado com sucesso.');
  }

  function updateStatusFilter(nextStatus: CommandStatusFilter) {
    setStatusFilter(nextStatus);

    const nextParams = new URLSearchParams(searchParams);

    if (nextStatus === 'all') {
      nextParams.delete('status');
    } else {
      nextParams.set('status', nextStatus);
    }

    setSearchParams(nextParams, { replace: true });
  }

  function clearAgentFilter() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('agent_id');
    setSearchParams(nextParams, { replace: true });
  }

  const totalCommands = commands.length;
  const pendingCommands = commands.filter(isPending).length;
  const successCommands = commands.filter((command) => getCommandDisplayStatus(command) === 'success').length;
  const failedCommands = commands.filter(isFailed).length;

  return (
    <section>
      <PageHeader
        title="Central de Comandos"
        description="Crie, acompanhe e audite ações remotas enviadas aos agentes."
        actions={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      {selectedAgentId || statusFilter !== 'all' ? (
        <Card className="mb-6 border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-bold text-blue-800">
                Filtros ativos na Central de Comandos
              </p>

              {selectedAgentId ? (
                <p className="mt-1 break-all text-sm text-blue-700">
                  Agente: {selectedAgentId}
                </p>
              ) : null}

              {statusFilter !== 'all' ? (
                <p className="mt-1 text-sm text-blue-700">
                  Status: {statusFilter}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedAgentId ? (
                <Link
                  to={`/agents/${selectedAgentId}`}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
                >
                  Ver agente
                </Link>
              ) : null}

              {selectedAgentId ? (
                <button
                  type="button"
                  onClick={clearAgentFilter}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
                >
                  Limpar agente
                </button>
              ) : null}

              {statusFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => updateStatusFilter('all')}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
                >
                  Limpar status
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total de comandos"
          value={totalCommands}
          description={selectedAgentId ? 'Criados para este agente' : 'Criados no ambiente'}
          icon="⚙️"
        />

        <StatCard
          title="Pendentes"
          value={pendingCommands}
          description="Fila ou execução"
          icon="⏳"
        />

        <StatCard
          title="Sucesso"
          value={successCommands}
          description="Finalizados corretamente"
          icon="✅"
        />

        <StatCard
          title="Falhas"
          value={failedCommands}
          description="Erro, timeout ou expirado"
          icon="⚠️"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <CommandForm
            initialAgentId={selectedAgentId}
            onSubmit={handleCreateCommand}
            isSubmitting={createCommandMutation.isPending}
          />

          {successMessage && (
            <Card className="border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>
            </Card>
          )}

          {createCommandMutation.isError && (
            <Card className="border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Não foi possível criar o comando.
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
                {createCommandMutation.error instanceof Error
                  ? createCommandMutation.error.message
                  : 'Erro desconhecido'}
              </pre>
            </Card>
          )}

          <Card className="p-5">
            <Badge variant="info">Dica</Badge>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Copie o ID do agente na tela de Agentes ou Detalhes do Agente e cole no campo
              “ID do agente” para enviar um comando.
            </p>
          </Card>
        </div>

        <div>
          <Card className="mb-4 p-5">
            <label className="block max-w-xs">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Filtrar por status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => updateStatusFilter(event.target.value as CommandStatusFilter)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
          </Card>

          {isError && (
            <Card className="mb-4 border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Não foi possível carregar os comandos.
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
                Exibindo <strong>{filteredCommands.length}</strong> de{' '}
                <strong>{totalCommands}</strong> comandos
                {selectedAgentId ? ' deste agente.' : '.'}
              </div>

              <CommandsTable commands={filteredCommands} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
