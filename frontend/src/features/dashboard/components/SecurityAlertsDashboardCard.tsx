import { Link } from 'react-router-dom';

import {
  useActiveSecurityAlerts,
  useSecurityAlertsSummary,
} from '../../securityAlerts/hooks/useSecurityAlerts';

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function severityLabel(severity: string) {
  if (severity === 'critical') {
    return 'Crítico';
  }

  if (severity === 'warning') {
    return 'Atenção';
  }

  return 'Info';
}

function severityBadgeClass(severity: string) {
  if (severity === 'critical') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (severity === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export function SecurityAlertsDashboardCard() {
  const summaryQuery = useSecurityAlertsSummary();
  const alertsQuery = useActiveSecurityAlerts({
    limit: 5,
  });

  const summary = summaryQuery.data?.summary;
  const byAgent = summaryQuery.data?.by_agent || [];
  const alerts = alertsQuery.data?.items || [];

  const isLoading = summaryQuery.isLoading || alertsQuery.isLoading;
  const hasError = summaryQuery.isError || alertsQuery.isError;

  const refresh = () => {
    summaryQuery.refetch();
    alertsQuery.refetch();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Alertas ativos de segurança
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Visão geral dos alertas ativos da última coleta de cada agente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/security-alerts"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ver todos
          </Link>

          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Carregando alertas de segurança...
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os alertas de segurança.
        </div>
      ) : null}

      {!isLoading && !hasError ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {summary?.total ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Críticos
              </p>
              <p className="mt-2 text-3xl font-bold text-red-950">
                {summary?.critical ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Atenção
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {summary?.warning ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Info
              </p>
              <p className="mt-2 text-3xl font-bold text-blue-950">
                {summary?.info ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Agentes afetados
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {summary?.agents_with_alerts ?? 0}
              </p>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Nenhum alerta ativo encontrado.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Alertas recentes
                </h3>
              </div>

              <div className="divide-y divide-slate-100">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityBadgeClass(alert.severity)}`}
                        >
                          {severityLabel(alert.severity)}
                        </span>

                        <Link
                          to={`/agents/${alert.agent_id}`}
                          className="text-sm font-semibold text-slate-950 hover:text-blue-700"
                        >
                          {alert.hostname || alert.agent_id}
                        </Link>
                      </div>

                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {alert.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {alert.description}
                      </p>
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      <p>{alert.category}</p>
                      <p>{formatDate(alert.collected_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byAgent.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Agentes com alertas
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Agente</th>
                      <th className="px-4 py-3 text-left">Total</th>
                      <th className="px-4 py-3 text-left">Crítico</th>
                      <th className="px-4 py-3 text-left">Atenção</th>
                      <th className="px-4 py-3 text-left">Última coleta</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {byAgent.map((agent) => (
                      <tr key={agent.agent_id}>
                        <td className="px-4 py-3">
                          <Link
                            to={`/agents/${agent.agent_id}`}
                            className="font-semibold text-slate-900 hover:text-blue-700"
                          >
                            {agent.hostname || agent.agent_id}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {agent.agent_version || 'versão não informada'}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {agent.total}
                        </td>
                        <td className="px-4 py-3 text-red-700">
                          {agent.critical}
                        </td>
                        <td className="px-4 py-3 text-amber-700">
                          {agent.warning}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(agent.last_collected_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
