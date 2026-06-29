import type { AgentHealthResponse } from '../api/agentHealthApi';

type Props = {
  health?: AgentHealthResponse;
  isLoading?: boolean;
  onRunDiagnostics?: () => void;
  isRunningDiagnostics?: boolean;
};

function formatSeconds(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return 'Nunca';

  if (seconds < 60) return `${seconds}s atrás`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;

  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function AgentHealthCard({
  health,
  isLoading,
  onRunDiagnostics,
  isRunningDiagnostics,
}: Props) {
  const isOnline = Boolean(health?.health.is_online);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Saúde do agente
          </h2>
          <p className="text-sm text-slate-500">
            Status de comunicação, check-in e diagnóstico remoto.
          </p>
        </div>

        <span
          className={[
            'inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium',
            isOnline
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-rose-100 text-rose-700',
          ].join(' ')}
        >
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">
          Carregando saúde do agente...
        </div>
      ) : !health ? (
        <div className="text-sm text-slate-500">
          Não foi possível carregar a saúde do agente.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Último check-in</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {formatSeconds(health.health.seconds_since_last_seen)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatDate(health.agent.last_seen_at)}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">IP interno</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {health.agent.internal_ip || 'Não informado'}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Versão do agente</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {health.agent.agent_version || 'Não informada'}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Hostname</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {health.agent.hostname || health.agent.name || 'Não informado'}
              </div>
            </div>
          </div>

          {health.health.needs_attention ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              O agente está sem check-in recente. Verifique se a tarefa agendada está rodando e se a URL do backend está correta.
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Agente comunicando normalmente com o backend.
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onRunDiagnostics}
              disabled={isRunningDiagnostics}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningDiagnostics ? 'Solicitando diagnóstico...' : 'Executar diagnóstico'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
