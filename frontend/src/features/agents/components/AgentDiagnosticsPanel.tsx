import { AgentHardwareSection } from './AgentHardwareSection';
import type { DiagnosticsData, AgentCommandSummary } from '../api/agentDiagnosticsApi';

type Props = {
  diagnostics?: DiagnosticsData;
  latestCommand?: AgentCommandSummary;
  failedCommand?: AgentCommandSummary;
  isLoading?: boolean;
  isRunningDiagnostics?: boolean;
  onRunDiagnostics?: () => void;
};

function formatPercent(value?: number) {
  if (value === undefined || value === null) return '—';
  return `${value}%`;
}

function formatGb(value?: number) {
  if (value === undefined || value === null) return '—';
  return `${value} GB`;
}

function formatUptime(seconds?: number) {
  if (!seconds) return '—';

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}min`;
  if (minutes > 0) return `${minutes}min`;

  return `${seconds}s`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function AgentDiagnosticsPanel({
  diagnostics,
  latestCommand,
  failedCommand,
  isLoading,
  isRunningDiagnostics,
  onRunDiagnostics,
}: Props) {
  const memory = diagnostics?.memory;
  const cpu = diagnostics?.cpu;
  const disks = diagnostics?.disks || [];
  const printers = diagnostics?.printers?.items || [];

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Diagnóstico remoto
          </h2>
          <p className="text-sm text-slate-500">
            Informações coletadas diretamente do agente Windows.
          </p>
        </div>

        <button
          type="button"
          onClick={onRunDiagnostics}
          disabled={isRunningDiagnostics}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunningDiagnostics ? 'Executando diagnóstico...' : 'Atualizar diagnóstico'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Carregando diagnóstico...</div>
      ) : !diagnostics ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum diagnóstico encontrado ainda. Clique em <strong>Atualizar diagnóstico</strong> para coletar os dados.
          </div>

          {failedCommand ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              Última tentativa falhou: {failedCommand.error_code || failedCommand.error_message || 'erro desconhecido'}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">CPU</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatPercent(cpu?.percent)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {cpu?.count_physical || '—'} físicos / {cpu?.count_logical || '—'} lógicos
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Memória</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatPercent(memory?.percent)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatGb(memory?.used_gb)} usados de {formatGb(memory?.total_gb)}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Spooler</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {diagnostics.spooler?.status || '—'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Serviço de impressão
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Uptime</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatUptime(diagnostics.uptime?.uptime_seconds)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Tempo desde a última inicialização
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Sistema
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Hostname</span>
                  <span className="font-medium text-slate-900">{diagnostics.hostname || '—'}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Usuário</span>
                  <span className="font-medium text-slate-900">{diagnostics.user || '—'}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Domínio</span>
                  <span className="font-medium text-slate-900">{diagnostics.domain || '—'}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Windows</span>
                  <span className="font-medium text-slate-900">
                    {diagnostics.os?.system || '—'} {diagnostics.os?.release || ''}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">IP interno</span>
                  <span className="font-medium text-slate-900">
                    {diagnostics.network?.internal_ip || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Discos
              </h3>

              {disks.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhum disco retornado.</div>
              ) : (
                <div className="space-y-3">
                  {disks.map((disk, index) => (
                    <div key={`${disk.device}-${index}`} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-900">
                          {disk.device || disk.mountpoint || `Disco ${index + 1}`}
                        </span>
                        <span className="text-slate-500">
                          {formatPercent(disk.percent)}
                        </span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${Math.min(Number(disk.percent || 0), 100)}%` }}
                        />
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {formatGb(disk.free_gb)} livres de {formatGb(disk.total_gb)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <AgentHardwareSection hardware={diagnostics.hardware} />


          <div className="rounded-lg border p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Impressoras detectadas
              </h3>

              <span className="text-xs text-slate-500">
                Total: {diagnostics.printers?.count ?? printers.length}
              </span>
            </div>

            {diagnostics.printers?.error ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                Erro ao coletar impressoras: {diagnostics.printers.error}
              </div>
            ) : null}

            {printers.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhuma impressora retornada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-slate-500">
                      <th className="py-2 pr-3">Nome</th>
                      <th className="py-2 pr-3">Driver</th>
                      <th className="py-2 pr-3">Porta</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Padrão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printers.map((printer, index) => (
                      <tr key={`${printer.name}-${index}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {printer.name || '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {printer.driver_name || '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {printer.port_name || '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {printer.status || '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {printer.is_default ? 'Sim' : 'Não'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500">
            Último diagnóstico: {formatDate(latestCommand?.updated_at || latestCommand?.created_at)}
          </div>
        </div>
      )}
    </div>
  );
}
