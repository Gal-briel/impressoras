import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Card } from '../../../components/ui/Card';
import { useAgentCommands } from '../../commands/hooks/useAgentCommands';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import type { Command } from '../../commands/types';

type AgentAdminActionsSectionProps = {
  agentId: string;
};

type SortBy = 'memory' | 'cpu' | 'name' | 'pid';
type ServiceStatus = '' | 'running' | 'stopped';


const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'fontdrvhost.exe',
  'dwm.exe',
  'memory compression',
  'memcompression',
]);

const PROTECTED_SERVICE_NAMES = new Set([
  'rpcss',
  'dcomlaunch',
  'plugplay',
  'eventlog',
  'samss',
  'winmgmt',
  'w32time',
  'nlasvc',
  'netprofm',
  'dhcp',
  'dnscache',
  'mpssvc',
  'windefend',
  'securityhealthservice',
  'schedule',
  'lanmanworkstation',
  'lanmanserver',
]);

function isProtectedProcess(name?: string | null) {
  return PROTECTED_PROCESS_NAMES.has(String(name || '').trim().toLowerCase());
}

function isProtectedService(name?: string | null) {
  return PROTECTED_SERVICE_NAMES.has(String(name || '').trim().toLowerCase());
}


type PendingAdminAction = {
  title: string;
  description: string;
  commandType: string;
  confirmWord: string;
  payload: Record<string, unknown>;
  timeoutSeconds?: number;
};

function buildIdempotencyKey(commandType: string) {
  return `${commandType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseCommandOutput(command?: Command | null): any | null {
  if (!command?.output) return null;

  try {
    return JSON.parse(command.output);
  } catch {
    return null;
  }
}

function getCommandType(command: Command) {
  return command.command_type || command.type || '';
}

function findLatestCommand(commands: Command[], commandType: string) {
  return [...commands]
    .filter((command) => getCommandType(command) === commandType)
    .sort((a, b) => {
      const dateA = new Date(a.created_at || '').getTime() || 0;
      const dateB = new Date(b.created_at || '').getTime() || 0;

      return dateB - dateA;
    })[0];
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown) {
  if (!error) return null;

  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro desconhecido.';
  }
}

function commandStatusLabel(status?: string) {
  if (!status) return '—';

  const labels: Record<string, string> = {
    queued: 'Na fila',
    pending: 'Pendente',
    dispatched: 'Despachado',
    acknowledged: 'Recebido',
    executing: 'Executando',
    success: 'Sucesso',
    failed: 'Falhou',
    timed_out: 'Expirou',
    timeout: 'Expirou',
    expired: 'Expirado',
  };

  return labels[status] || status;
}

function commandStatusClass(status?: string) {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';

  if (status === 'failed' || status === 'timed_out' || status === 'timeout' || status === 'expired') {
    return 'bg-red-50 text-red-700 ring-red-200';
  }

  if (status === 'executing' || status === 'dispatched' || status === 'acknowledged') {
    return 'bg-blue-50 text-blue-700 ring-blue-200';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200';
}

function CommandMiniStatus({ command }: { command?: Command | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span
        className={`inline-flex rounded-full px-2 py-1 font-semibold ring-1 ${commandStatusClass(command?.status)}`}
      >
        {commandStatusLabel(command?.status)}
      </span>
      <span>{formatDateTime(command?.finished_at || command?.created_at)}</span>
    </div>
  );
}

export function AgentAdminActionsSection({ agentId }: AgentAdminActionsSectionProps) {
  const queryClient = useQueryClient();
  const createCommandMutation = useCreateCommand();

  const {
    data: commandsData,
    refetch: refetchCommands,
    isFetching: isFetchingCommands,
  } = useAgentCommands(agentId);

  const [processLimit, setProcessLimit] = useState(20);
  const [processSortBy, setProcessSortBy] = useState<SortBy>('memory');

  const [serviceLimit, setServiceLimit] = useState(50);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('running');

  const [powerDelay, setPowerDelay] = useState(300);
  const [powerReason, setPowerReason] = useState('Ação administrativa solicitada pelo Gabriel.');
  const [rebootConfirm, setRebootConfirm] = useState('');
  const [shutdownConfirm, setShutdownConfirm] = useState('');

  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const [actionConfirmation, setActionConfirmation] = useState('');

  const [successMessage, setSuccessMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const commands = commandsData?.items || [];

  const latestProcessesCommand = useMemo(
    () => findLatestCommand(commands, 'collect_processes'),
    [commands],
  );

  const latestServicesCommand = useMemo(
    () => findLatestCommand(commands, 'collect_services'),
    [commands],
  );

  const latestProcesses = parseCommandOutput(latestProcessesCommand);
  const latestServices = parseCommandOutput(latestServicesCommand);

  const processItems = Array.isArray(latestProcesses?.items)
    ? latestProcesses.items.slice(0, 10)
    : [];

  const serviceItems = Array.isArray(latestServices?.items)
    ? latestServices.items.slice(0, 10)
    : [];

  async function refreshCommandQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['commands'] }),
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'commands'] }),
      queryClient.invalidateQueries({ queryKey: ['agents', agentId] }),
      refetchCommands(),
    ]);

    await queryClient.refetchQueries({
      type: 'active',
    });
  }

  async function sendCommand(
    commandType: string,
    payload: Record<string, unknown>,
    timeoutSeconds = 120,
    followUpCommand?: {
      commandType: string;
      payload: Record<string, unknown>;
      timeoutSeconds?: number;
    },
  ) {
    setSuccessMessage('');
    setLocalError('');

    try {
      await createCommandMutation.mutateAsync({
        agent_id: agentId,
        command_type: commandType,
        payload,
        idempotency_key: buildIdempotencyKey(commandType),
        timeout_seconds: timeoutSeconds,
      });

      setSuccessMessage(`Comando "${commandType}" enviado para o agente.`);

      if (followUpCommand) {
        setTimeout(() => {
          createCommandMutation.mutate({
            agent_id: agentId,
            command_type: followUpCommand.commandType,
            payload: followUpCommand.payload,
            idempotency_key: buildIdempotencyKey(followUpCommand.commandType),
            timeout_seconds: followUpCommand.timeoutSeconds || 120,
          });
        }, 3500);
      }

      setTimeout(() => {
        refreshCommandQueries();
      }, followUpCommand ? 7000 : 2500);
    } catch (error) {
      setLocalError(getErrorMessage(error) || 'Erro ao enviar comando.');
    }
  }

  function openSafeAction(action: PendingAdminAction) {
    setLocalError('');
    setSuccessMessage('');
    setPendingAction(action);
    setActionConfirmation('');
  }

  async function confirmSafeAction() {
    if (!pendingAction) return;

    if (actionConfirmation.trim().toUpperCase() !== pendingAction.confirmWord) {
      setLocalError(`Digite ${pendingAction.confirmWord} para confirmar esta ação.`);
      return;
    }

    const followUpCommand =
      pendingAction.commandType === 'kill_process'
        ? {
            commandType: 'collect_processes',
            payload: {
              limit: processLimit,
              sort_by: processSortBy,
            },
            timeoutSeconds: 120,
          }
        : ['start_service', 'stop_service', 'restart_service'].includes(pendingAction.commandType)
          ? {
              commandType: 'collect_services',
              payload: {
                limit: serviceLimit,
                status: serviceStatus || undefined,
              },
              timeoutSeconds: 120,
            }
          : undefined;

    await sendCommand(
      pendingAction.commandType,
      {
        ...pendingAction.payload,
        confirm: pendingAction.confirmWord,
      },
      pendingAction.timeoutSeconds || 120,
      followUpCommand,
    );

    setPendingAction(null);
    setActionConfirmation('');
  }

  async function handleCollectProcesses(event: FormEvent) {
    event.preventDefault();

    await sendCommand('collect_processes', {
      limit: processLimit,
      sort_by: processSortBy,
    });
  }

  async function handleCollectServices(event: FormEvent) {
    event.preventDefault();

    await sendCommand('collect_services', {
      limit: serviceLimit,
      status: serviceStatus || undefined,
    });
  }

  async function handleCancelPowerAction() {
    await sendCommand('cancel_power_action', {}, 60);
  }

  async function handleReboot(event: FormEvent) {
    event.preventDefault();

    if (rebootConfirm.trim().toUpperCase() !== 'REBOOT') {
      setLocalError('Para reiniciar a máquina, digite REBOOT no campo de confirmação.');
      return;
    }

    await sendCommand(
      'reboot_machine',
      {
        confirm: 'REBOOT',
        delay_seconds: powerDelay,
        reason: powerReason,
      },
      60,
    );

    setRebootConfirm('');
  }

  async function handleShutdown(event: FormEvent) {
    event.preventDefault();

    if (shutdownConfirm.trim().toUpperCase() !== 'SHUTDOWN') {
      setLocalError('Para desligar a máquina, digite SHUTDOWN no campo de confirmação.');
      return;
    }

    await sendCommand(
      'shutdown_machine',
      {
        confirm: 'SHUTDOWN',
        delay_seconds: powerDelay,
        reason: powerReason,
      },
      60,
    );

    setShutdownConfirm('');
  }

  const isSending = createCommandMutation.isPending;
  const errorMessage = localError || getErrorMessage(createCommandMutation.error);

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Administração remota
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Execute coletas administrativas e ações controladas neste agente.
        </p>
      </div>

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {pendingAction ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-bold text-red-900">
                Confirmação necessária: {pendingAction.title}
              </h3>
              <p className="mt-1 text-sm text-red-800">
                {pendingAction.description}
              </p>
              <p className="mt-2 text-xs font-semibold text-red-700">
                Para confirmar, digite <span className="font-mono">{pendingAction.confirmWord}</span>.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={actionConfirmation}
                onChange={(event) => setActionConfirmation(event.target.value)}
                placeholder={pendingAction.confirmWord}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />

              <button
                type="button"
                disabled={isSending || actionConfirmation.trim().toUpperCase() !== pendingAction.confirmWord}
                onClick={confirmSafeAction}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar
              </button>

              <button
                type="button"
                disabled={isSending}
                onClick={() => {
                  setPendingAction(null);
                  setActionConfirmation('');
                }}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Resultados administrativos</p>
          <p className="text-xs text-slate-500">
            Últimos comandos de processos e serviços deste agente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetchCommands()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {isFetchingCommands ? 'Atualizando...' : 'Atualizar resultados'}
        </button>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Últimos processos</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Total coletado: {latestProcesses?.count ?? '—'} • Ordenação: {latestProcesses?.sort_by ?? '—'}
                </p>
              </div>

              <CommandMiniStatus command={latestProcessesCommand} />
            </div>
          </div>

          {processItems.length ? (
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">PID</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Processo</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Memória</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">CPU</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {processItems.map((item: any) => {
                    const protectedProcess = isProtectedProcess(item.name);

                    return (
                    <tr key={`${item.pid}-${item.name}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.pid ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.name ?? '—'}</span>
                          {protectedProcess ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              Protegido
                            </span>
                          ) : null}
                        </div>
                        <div className="max-w-xs truncate text-xs text-slate-500">{item.username ?? item.path ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">{item.memory_mb ?? '—'} MB</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">{item.cpu_seconds ?? '—'}s</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={protectedProcess}
                          onClick={() => openSafeAction({
                            title: `Encerrar processo ${item.name || item.pid}`,
                            description: `Esta ação tentará encerrar o processo PID ${item.pid}. Use somente quando tiver certeza.`,
                            commandType: 'kill_process',
                            confirmWord: 'KILL',
                            payload: {
                              pid: item.pid,
                              process_name: item.name,
                            },
                            timeoutSeconds: 90,
                          })}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {protectedProcess ? 'Bloqueado' : 'Encerrar'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum resultado de processos coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Últimos serviços</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Total coletado: {latestServices?.count ?? '—'} • Filtro: {latestServices?.status_filter ?? 'todos'}
                </p>
              </div>

              <CommandMiniStatus command={latestServicesCommand} />
            </div>
          </div>

          {serviceItems.length ? (
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Serviço</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Inicialização</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">PID</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {serviceItems.map((item: any) => {
                    const protectedService = isProtectedService(item.name);

                    return (
                    <tr key={item.name}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.display_name || item.name || '—'}</span>
                          {protectedService ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              Protegido
                            </span>
                          ) : null}
                        </div>
                        <div className="max-w-xs truncate text-xs text-slate-500">{item.name ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">{item.status ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{item.startup_type ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">{item.process_id ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openSafeAction({
                              title: `Iniciar serviço ${item.name}`,
                              description: `Esta ação tentará iniciar o serviço ${item.display_name || item.name}.`,
                              commandType: 'start_service',
                              confirmWord: 'START',
                              payload: {
                                service_name: item.name,
                              },
                              timeoutSeconds: 90,
                            })}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Iniciar
                          </button>

                          <button
                            type="button"
                            disabled={protectedService}
                            onClick={() => openSafeAction({
                              title: `Parar serviço ${item.name}`,
                              description: `Esta ação tentará parar o serviço ${item.display_name || item.name}. Serviços críticos podem afetar o Windows.`,
                              commandType: 'stop_service',
                              confirmWord: 'STOP',
                              payload: {
                                service_name: item.name,
                              },
                              timeoutSeconds: 90,
                            })}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {protectedService ? 'Bloqueado' : 'Parar'}
                          </button>

                          <button
                            type="button"
                            disabled={protectedService}
                            onClick={() => openSafeAction({
                              title: `Reiniciar serviço ${item.name}`,
                              description: `Esta ação tentará reiniciar o serviço ${item.display_name || item.name}.`,
                              commandType: 'restart_service',
                              confirmWord: 'RESTART',
                              payload: {
                                service_name: item.name,
                              },
                              timeoutSeconds: 90,
                            })}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {protectedService ? 'Bloqueado' : 'Reiniciar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum resultado de serviços coletado ainda.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={handleCollectProcesses} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Processos</h3>
          <p className="mt-1 text-sm text-slate-500">
            Coleta processos em execução no Windows.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              Limite
              <input
                type="number"
                min={1}
                max={500}
                value={processLimit}
                onChange={(event) => setProcessLimit(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Ordenar por
              <select
                value={processSortBy}
                onChange={(event) => setProcessSortBy(event.target.value as SortBy)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="memory">Memória</option>
                <option value="cpu">CPU acumulada</option>
                <option value="name">Nome</option>
                <option value="pid">PID</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={isSending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? 'Enviando...' : 'Coletar processos'}
            </button>
          </div>
        </form>

        <form onSubmit={handleCollectServices} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Serviços</h3>
          <p className="mt-1 text-sm text-slate-500">
            Lista serviços do Windows com filtro por status.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              Limite
              <input
                type="number"
                min={1}
                max={1000}
                value={serviceLimit}
                onChange={(event) => setServiceLimit(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={serviceStatus}
                onChange={(event) => setServiceStatus(event.target.value as ServiceStatus)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Todos</option>
                <option value="running">Running</option>
                <option value="stopped">Stopped</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={isSending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? 'Enviando...' : 'Coletar serviços'}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Energia</h3>
          <p className="mt-1 text-sm text-amber-800">
            Reboot e desligamento exigem confirmação digitada.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-amber-950">
              Atraso em segundos
              <input
                type="number"
                min={0}
                max={3600}
                value={powerDelay}
                onChange={(event) => setPowerDelay(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label className="text-sm font-medium text-amber-950">
              Motivo
              <input
                type="text"
                value={powerReason}
                onChange={(event) => setPowerReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <form onSubmit={handleReboot} className="grid gap-2">
              <label className="text-sm font-medium text-amber-950">
                Digite REBOOT para reiniciar
                <input
                  type="text"
                  value={rebootConfirm}
                  onChange={(event) => setRebootConfirm(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <button
                type="submit"
                disabled={isSending || rebootConfirm.trim().toUpperCase() !== 'REBOOT'}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Agendar reinicialização
              </button>
            </form>

            <form onSubmit={handleShutdown} className="grid gap-2">
              <label className="text-sm font-medium text-amber-950">
                Digite SHUTDOWN para desligar
                <input
                  type="text"
                  value={shutdownConfirm}
                  onChange={(event) => setShutdownConfirm(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <button
                type="submit"
                disabled={isSending || shutdownConfirm.trim().toUpperCase() !== 'SHUTDOWN'}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Agendar desligamento
              </button>
            </form>

            <button
              type="button"
              disabled={isSending}
              onClick={handleCancelPowerAction}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar ação de energia
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
