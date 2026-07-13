import { useEffect, useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useAgentCommands } from '../../commands/hooks/useAgentCommands';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import { PrintersTable } from '../../printers/components/PrintersTable';
import { useAgentPrinters } from '../../printers/hooks/useAgentPrinters';

type DiscoveryItem = {
  id?: string;
  source?: string;
  type?: string;
  install_method?: string;
  name?: string | null;
  ip?: string | null;
  hostname?: string | null;
  share_path?: string | null;
  protocols?: string[];
  open_ports?: number[];
  driver_name?: string | null;
  driver_hint?: string | null;
  location?: string | null;
  description?: string | null;
  confidence?: string;
};

type DiscoveryResult = {
  status?: string;
  hostname?: string;
  platform?: string;
  networks?: Array<{
    network?: string;
    interface?: string;
    source_ip?: string;
    source?: string;
  }>;
  scan?: {
    ports?: number[];
    total_ips_scanned?: number;
    timeout_seconds?: number;
    max_workers?: number;
    max_hosts_per_subnet?: number;
  };
  total?: number;
  items?: DiscoveryItem[];
  warnings?: string[];
};

type LooseCommand = {
  id?: string;
  command_type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  output?: string | null;
  result?: string | null;
  error_message?: string | null;
};

function parseDiscoveryOutput(command?: LooseCommand): DiscoveryResult | null {
  const rawOutput =
    command?.output ||
    command?.result ||
    command?.error_message ||
    '';

  if (!rawOutput) {
    return null;
  }

  const jsonStart = rawOutput.indexOf('{');

  if (jsonStart < 0) {
    return null;
  }

  try {
    return JSON.parse(rawOutput.slice(jsonStart)) as DiscoveryResult;
  } catch {
    return null;
  }
}


function isCommandRunning(status?: string) {
  return ['queued', 'running', 'in_progress', 'pending'].includes(status || '');
}

function getCommandStatusLabel(status?: string) {
  switch (status) {
    case 'queued':
      return 'Na fila';
    case 'running':
    case 'in_progress':
      return 'Executando';
    case 'success':
    case 'completed':
      return 'Concluído';
    case 'failed':
    case 'error':
      return 'Falhou';
    default:
      return status || 'Desconhecido';
  }
}

export function AgentPrintersPanel({ agentId }: { agentId: string }) {
  const [successMessage, setSuccessMessage] = useState('');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgentPrinters(agentId);

  const commandsQuery = useAgentCommands(agentId);
  const createCommandMutation = useCreateCommand();

  const printers = data?.items || [];
  const commands = (commandsQuery.data?.items || []) as LooseCommand[];

  const latestDiscoveryCommand = useMemo(() => {
    return [...commands]
      .filter((command) => command.command_type === 'discover_network_printers')
      .sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.completed_at || b.updated_at || b.created_at || 0).getTime();

        return dateB - dateA;
      })[0];
  }, [commands]);

  const discoveryResult = useMemo(
    () => parseDiscoveryOutput(latestDiscoveryCommand),
    [latestDiscoveryCommand],
  );

  const shouldAutoRefreshDiscovery = isCommandRunning(latestDiscoveryCommand?.status);

  useEffect(() => {
    if (!shouldAutoRefreshDiscovery) {
      return;
    }

    const interval = window.setInterval(() => {
      commandsQuery.refetch();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [commandsQuery, shouldAutoRefreshDiscovery]);


  async function handleCollectInventory() {
    setSuccessMessage('');

    await createCommandMutation.mutateAsync({
      agent_id: agentId,
      command_type: 'collect_inventory',
      payload: {
        reason: 'manual_printer_inventory_request',
        source: 'agent_printers_panel',
      },
    });

    setSuccessMessage('Comando de coleta de inventário enviado para este agente.');
    await commandsQuery.refetch();
  }

  async function handleDiscoverNetworkPrinters() {
    setSuccessMessage('');

    await createCommandMutation.mutateAsync({
      agent_id: agentId,
      command_type: 'discover_network_printers',
      payload: {
        max_hosts_per_subnet: 254,
        timeout_seconds: 0.35,
        max_workers: 96,
        ports: [9100, 631, 515],
        include_http_ports: false,
        include_http_probe: false,
      },
      timeout_seconds: 300,
    });

    setSuccessMessage('Busca de impressoras na rede enviada para este agente.');
    await commandsQuery.refetch();
  }

  const isSendingCommand = createCommandMutation.isPending;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Impressoras do agente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Impressoras instaladas e dispositivos de impressão encontrados na rede local do agente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDiscoverNetworkPrinters}
            disabled={isSendingCommand}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingCommand ? 'Enviando...' : 'Buscar impressoras na rede'}
          </button>

          <button
            onClick={handleCollectInventory}
            disabled={isSendingCommand}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingCommand ? 'Enviando...' : 'Solicitar inventário'}
          </button>

          <button
            onClick={() => {
              refetch();
              commandsQuery.refetch();
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching || commandsQuery.isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {successMessage && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>
          <p className="mt-1 text-sm text-emerald-700">
            Você pode acompanhar o andamento na aba Comandos deste agente.
          </p>
        </Card>
      )}

      {createCommandMutation.isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível enviar o comando.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {createCommandMutation.error instanceof Error
              ? createCommandMutation.error.message
              : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {latestDiscoveryCommand && (
        <Card className="mb-4 border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Descoberta de rede</Badge>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {getCommandStatusLabel(latestDiscoveryCommand.status)}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                Última busca executada pelo agente para localizar dispositivos de impressão na rede.
              </p>
            </div>

            {latestDiscoveryCommand.created_at && (
              <p className="text-xs text-slate-400">
                {new Date(latestDiscoveryCommand.created_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {discoveryResult ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Encontrados
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
                    {discoveryResult.total ?? discoveryResult.items?.length ?? 0}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    IPs varridos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
                    {discoveryResult.scan?.total_ips_scanned ?? '—'}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Rede
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {discoveryResult.networks?.[0]?.network || '—'}
                  </p>
                </div>
              </div>

              {discoveryResult.items && discoveryResult.items.length > 0 ? (
                <div className="space-y-3">
                  {discoveryResult.items.map((item) => (
                    <div
                      key={item.id || `${item.ip}-${item.share_path}-${item.name}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {item.name || item.hostname || item.ip || item.share_path || 'Dispositivo encontrado'}
                          </p>

                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {item.ip && <span>IP: {item.ip}</span>}
                            {item.hostname && <span>Host: {item.hostname}</span>}
                            {item.share_path && <span>Compartilhamento: {item.share_path}</span>}
                          </div>
                        </div>

                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {item.confidence || 'detectado'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.install_method && (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                            {item.install_method}
                          </span>
                        )}

                        {item.protocols?.map((protocol) => (
                          <span
                            key={protocol}
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                          >
                            {protocol}
                          </span>
                        ))}

                        {item.open_ports?.map((port) => (
                          <span
                            key={port}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                          >
                            porta {port}
                          </span>
                        ))}
                      </div>

                      {!item.driver_name && (
                        <p className="mt-3 text-xs text-amber-700">
                          Driver ainda não identificado. A instalação automática será tratada em uma próxima etapa.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Card className="border-blue-200 bg-blue-50 p-4">
                  <Badge variant="info">Busca concluída</Badge>
                  <p className="mt-2 text-sm text-blue-800">
                    A busca foi concluída, mas nenhum dispositivo de impressão respondeu nas portas testadas.
                  </p>
                </Card>
              )}

              {discoveryResult.warnings && discoveryResult.warnings.length > 0 && (
                <Card className="border-amber-200 bg-amber-50 p-4">
                  <Badge variant="warning">Avisos da busca</Badge>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                    {discoveryResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              O comando ainda não retornou um resultado estruturado. Atualize em alguns segundos ou consulte a aba Comandos.
            </p>
          )}
        </Card>
      )}

      {data?.warning && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <Badge variant="warning">Aviso</Badge>
          <p className="mt-2 text-sm text-amber-700">
            A tela está pronta, mas o backend ainda não possui inventário real de impressoras para este agente.
          </p>
        </Card>
      )}

      {printers.length === 0 && !isLoading && (
        <Card className="mb-4 border-blue-200 bg-blue-50 p-4">
          <Badge variant="info">Inventário</Badge>
          <p className="mt-2 text-sm text-blue-800">
            Nenhuma impressora instalada foi encontrada ainda. Clique em <strong>Solicitar inventário</strong> para atualizar as impressoras locais ou em <strong>Buscar impressoras na rede</strong> para procurar dispositivos disponíveis.
          </p>
        </Card>
      )}

      {isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar as impressoras deste agente.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-16 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Total de <strong>{printers.length}</strong> impressoras instaladas para este agente.
          </div>

          <PrintersTable printers={printers} />
        </>
      )}
    </div>
  );
}
