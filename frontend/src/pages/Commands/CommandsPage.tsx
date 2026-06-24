import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAgents } from '../../api/agentApi';
import { createCommand, listCommands } from '../../api/commandApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { commandTypes } from '../../types/command';
import { formatDateTime } from '../../utils/date';
import { downloadCsv } from '../../utils/exportCsv';

export function CommandsPage() {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [commandType, setCommandType] = useState<string>(commandTypes[0]);
  const [payload, setPayload] = useState('{}');
  const [status, setStatus] = useState('');
  const commandsQuery = useQuery({ queryKey: ['commands', { status }], queryFn: () => listCommands({ status: status || undefined, limit: 200 }) });
  const agentsQuery = useQuery({ queryKey: ['agents', 'command-options'], queryFn: () => listAgents({ limit: 200 }) });
  const commands = commandsQuery.data?.items ?? [];
  const filtered = useMemo(() => commands, [commands]);

  const createMutation = useMutation({
    mutationFn: () => {
      const parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      return createCommand(agentId, {
        command_type: commandType,
        payload: parsedPayload,
        timeout_seconds: 120,
        idempotency_key: `${commandType}-${Date.now()}`,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['commands'] });
    },
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div>
      <PageHeader title="Central de comandos" description="Execute comandos remotos e acompanhe o ciclo de vida da execução." actions={<Button variant="secondary" disabled={!filtered.length} onClick={() => downloadCsv('comandos.csv', filtered.map((command) => ({ type: command.command_type, status: command.status, agent: command.agent_hostname ?? command.agent_id, created_at: command.created_at })))}>Exportar CSV</Button>} />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Criar comando</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Agente</label>
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">Selecione</option>
                {agentsQuery.data?.items.map((agent) => <option key={agent.id} value={agent.id}>{agent.hostname}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <select value={commandType} onChange={(event) => setCommandType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {commandTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Payload JSON</label>
              <textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={6} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
            {createMutation.error && <ErrorState error={createMutation.error} />}
            <Button type="submit" disabled={!agentId || createMutation.isPending}>{createMutation.isPending ? 'Enviando...' : 'Enviar comando'}</Button>
          </form>
        </Card>
        <div>
          <Card className="mb-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">Todos os status</option>
                <option value="queued">Queued</option><option value="dispatched">Dispatched</option><option value="acknowledged">Acknowledged</option><option value="executing">Executing</option><option value="success">Success</option><option value="failed">Failed</option><option value="timed_out">TimedOut</option><option value="expired">Expired</option>
              </select>
              <Button variant="secondary" onClick={() => setStatus('')}>Limpar</Button>
            </div>
          </Card>
          {commandsQuery.isLoading && <LoadingState />}
          {commandsQuery.error && <ErrorState error={commandsQuery.error} />}
          {!commandsQuery.isLoading && !commandsQuery.error && filtered.length === 0 && <EmptyState title="Nenhum comando encontrado" />}
          <div className="space-y-3">
            {filtered.map((command) => (
              <Card key={command.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-semibold">{command.command_type}</p><p className="text-sm text-slate-500">{command.agent_hostname ?? command.agent_id} • {formatDateTime(command.created_at)}</p></div>
                  <Badge tone={statusTone(command.status)}>{command.status}</Badge>
                </div>
                {(command.output || command.error_code) && <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{command.error_code ? `Erro: ${command.error_code}\n` : ''}{command.output}</pre>}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
