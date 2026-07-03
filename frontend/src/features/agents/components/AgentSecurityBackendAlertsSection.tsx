import {
  useLatestSecurityAlerts,
  useLatestSecuritySnapshotComparison,
} from '../hooks/usePersistedInventory';

type Props = {
  agentId?: string;
};

function severityLabel(severity: string) {
  if (severity === 'critical') {
    return 'CRÍTICO';
  }

  if (severity === 'warning') {
    return 'ATENÇÃO';
  }

  return 'INFO';
}

function alertClassName(severity: string) {
  if (severity === 'critical') {
    return 'border-red-200 bg-red-50 text-red-950';
  }

  if (severity === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-950';
  }

  return 'border-blue-200 bg-blue-50 text-blue-950';
}

function badgeClassName(severity: string) {
  if (severity === 'critical') {
    return 'border-red-300 bg-red-50 text-red-700';
  }

  if (severity === 'warning') {
    return 'border-amber-300 bg-amber-50 text-amber-700';
  }

  return 'border-blue-300 bg-blue-50 text-blue-700';
}

function deltaLabel(value?: number | null) {
  if (value == null) {
    return 'Sem comparação';
  }

  if (value > 0) {
    return `Melhorou +${value}`;
  }

  if (value < 0) {
    return `Piorou ${value}`;
  }

  return 'Sem alteração';
}

export function AgentSecurityBackendAlertsSection({ agentId }: Props) {
  const alertsQuery = useLatestSecurityAlerts(agentId);
  const comparisonQuery = useLatestSecuritySnapshotComparison(agentId);

  const alerts = alertsQuery.data?.alerts || [];
  const summary = alertsQuery.data?.summary;
  const delta = comparisonQuery.data?.delta;

  const refresh = () => {
    alertsQuery.refetch();
    comparisonQuery.refetch();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Alertas automáticos de segurança
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Alertas calculados pelo backend com base na última coleta persistida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Críticos · {summary?.critical ?? 0}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Atenção · {summary?.warning ?? 0}
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Info · {summary?.info ?? 0}
          </span>

          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </div>

      {alertsQuery.isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Carregando alertas de segurança...
        </div>
      ) : null}

      {alertsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os alertas de segurança do backend.
        </div>
      ) : null}

      {!alertsQuery.isLoading && !alertsQuery.isError ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total de alertas
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {summary?.total ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Variação do score
              </p>
              <p className="mt-2 text-lg font-bold text-blue-950">
                {deltaLabel(delta?.security_score)}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Variação atenção
              </p>
              <p className="mt-2 text-lg font-bold text-amber-950">
                {deltaLabel(delta?.warning_alerts)}
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Variação críticos
              </p>
              <p className="mt-2 text-lg font-bold text-red-950">
                {deltaLabel(delta?.critical_alerts)}
              </p>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Nenhum alerta de segurança encontrado na última coleta.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.category}-${alert.title}-${index}`}
                  className={`rounded-xl border p-4 ${alertClassName(alert.severity)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{alert.title}</p>
                      <p className="mt-1 text-sm opacity-80">{alert.description}</p>
                      <p className="mt-2 text-xs opacity-70">
                        Categoria: {alert.category}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${badgeClassName(alert.severity)}`}
                    >
                      {severityLabel(alert.severity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
