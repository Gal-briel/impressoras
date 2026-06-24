import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgents } from '../../api/agentApi';
import { listCommands } from '../../api/commandApi';
import { listPrinters } from '../../api/printerApi';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Badge, statusTone } from '../../components/ui/Badge';
import { formatDateTime } from '../../utils/date';

export function DashboardPage() {
  const agentsQuery = useQuery({ queryKey: ['agents', 'dashboard'], queryFn: () => listAgents({ limit: 200 }) });
  const commandsQuery = useQuery({ queryKey: ['commands', 'dashboard'], queryFn: () => listCommands({ limit: 100 }) });
  const printersQuery = useQuery({ queryKey: ['printers', 'dashboard'], queryFn: () => listPrinters({ limit: 100 }) });

  const stats = useMemo(() => {
    const agents = agentsQuery.data?.items ?? [];
    const commands = commandsQuery.data?.items ?? [];
    return {
      online: agents.filter((agent) => agent.calculated_status === 'online').length,
      offline: agents.filter((agent) => agent.calculated_status !== 'online').length,
      pendingCommands: commands.filter((command) => ['queued', 'dispatched', 'acknowledged', 'executing'].includes(command.status)).length,
      printers: printersQuery.data?.total ?? 0,
    };
  }, [agentsQuery.data?.items, commandsQuery.data?.items, printersQuery.data?.total]);

  const isLoading = agentsQuery.isLoading || commandsQuery.isLoading || printersQuery.isLoading;
  const error = agentsQuery.error || commandsQuery.error || printersQuery.error;

  return (
    <div>
      <PageHeader title="Dashboard operacional" description="Visão geral dos agentes, comandos e impressoras do tenant atual." />
      {isLoading && <LoadingState />}
      {error && <ErrorState error={error} />}
      {!isLoading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Agentes Online" value={stats.online} helper="Atualizado por check-in e WebSocket" />
            <StatCard title="Agentes Offline" value={stats.offline} helper="Inclui desconhecidos e revogados" />
            <StatCard title="Comandos Pendentes" value={stats.pendingCommands} helper="Fila e execução" />
            <StatCard title="Impressoras Instaladas" value={stats.printers} helper="Inventário coletado" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Últimos agentes</h2>
              <div className="space-y-3">
                {(agentsQuery.data?.items ?? []).slice(0, 6).map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div>
                      <p className="font-medium">{agent.hostname}</p>
                      <p className="text-xs text-slate-500">{agent.last_ip ?? '-'} • {formatDateTime(agent.last_seen)}</p>
                    </div>
                    <Badge tone={statusTone(agent.calculated_status)}>{agent.calculated_status ?? 'unknown'}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Últimos comandos</h2>
              <div className="space-y-3">
                {(commandsQuery.data?.items ?? []).slice(0, 6).map((command) => (
                  <div key={command.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div>
                      <p className="font-medium">{command.command_type}</p>
                      <p className="text-xs text-slate-500">{command.agent_hostname ?? command.agent_id} • {formatDateTime(command.created_at)}</p>
                    </div>
                    <Badge tone={statusTone(command.status)}>{command.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
