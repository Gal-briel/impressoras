import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAgent, listAgentEvents } from '../../api/agentApi';
import { listAgentPrinters } from '../../api/printerApi';
import { listAgentCommands } from '../../api/commandApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDateTime } from '../../utils/date';

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const agentQuery = useQuery({ queryKey: ['agents', agentId], queryFn: () => getAgent(agentId!), enabled: Boolean(agentId) });
  const printersQuery = useQuery({ queryKey: ['agents', agentId, 'printers'], queryFn: () => listAgentPrinters(agentId!), enabled: Boolean(agentId) });
  const eventsQuery = useQuery({ queryKey: ['agents', agentId, 'events'], queryFn: () => listAgentEvents(agentId!), enabled: Boolean(agentId) });
  const commandsQuery = useQuery({ queryKey: ['agents', agentId, 'commands'], queryFn: () => listAgentCommands(agentId!), enabled: Boolean(agentId) });

  if (agentQuery.isLoading) return <LoadingState />;
  if (agentQuery.error) return <ErrorState error={agentQuery.error} />;
  const agent = agentQuery.data;
  if (!agent) return <EmptyState title="Agente não encontrado" />;

  return (
    <div>
      <PageHeader title={agent.hostname} description="Detalhes operacionais do agente, impressoras, eventos e comandos." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <h2 className="mb-4 text-lg font-semibold">Geral</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Tenant</dt><dd>{agent.tenant_id}</dd></div>
            <div><dt className="text-slate-500">Versão</dt><dd>{agent.agent_version ?? '-'}</dd></div>
            <div><dt className="text-slate-500">IP</dt><dd>{agent.last_ip ?? '-'}</dd></div>
            <div><dt className="text-slate-500">Último heartbeat</dt><dd>{formatDateTime(agent.last_seen)}</dd></div>
            <div><dt className="text-slate-500">Status</dt><dd><Badge tone={statusTone(agent.enrollment_status === 'revoked' ? 'revoked' : agent.calculated_status)}>{agent.enrollment_status === 'revoked' ? 'revoked' : agent.calculated_status ?? 'unknown'}</Badge></dd></div>
            <div><dt className="text-slate-500">Tags</dt><dd>{agent.tags?.map((tag) => tag.name).join(', ') || '-'}</dd></div>
          </dl>
        </Card>
        <Card className="xl:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Comandos recentes</h2>
          {commandsQuery.isLoading && <LoadingState />}
          {commandsQuery.error && <ErrorState error={commandsQuery.error} />}
          {!commandsQuery.isLoading && (commandsQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhum comando encontrado" />}
          <div className="space-y-3">
            {commandsQuery.data?.items.slice(0, 10).map((command) => (
              <div key={command.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div>
                  <p className="font-medium">{command.command_type}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(command.created_at)}</p>
                </div>
                <Badge tone={statusTone(command.status)}>{command.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Impressoras</h2>
          {printersQuery.isLoading && <LoadingState />}
          {printersQuery.error && <ErrorState error={printersQuery.error} />}
          {!printersQuery.isLoading && (printersQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhuma impressora encontrada" />}
          <div className="space-y-3">
            {printersQuery.data?.items.map((printer) => (
              <div key={printer.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="font-medium">{printer.name}</p>
                <p className="text-xs text-slate-500">{printer.driver ?? '-'} • {printer.port ?? '-'}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Eventos</h2>
          {eventsQuery.isLoading && <LoadingState />}
          {eventsQuery.error && <ErrorState error={eventsQuery.error} />}
          {!eventsQuery.isLoading && (eventsQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhum evento encontrado" />}
          <div className="space-y-3">
            {eventsQuery.data?.items.slice(0, 15).map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{event.event_type}</p>
                  <Badge tone={statusTone(event.severity)}>{event.severity}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{event.message}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
