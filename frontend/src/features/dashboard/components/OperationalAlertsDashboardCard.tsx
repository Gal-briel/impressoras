import { Link } from 'react-router-dom';

import {
  useOperationalAlerts,
  useOperationalAlertsSummary,
} from '../../operationalAlerts/hooks/useOperationalAlerts';

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

function alertTypeLabel(alertType: string) {
  const labels: Record<string, string> = {
    command_failed: 'Falha em comando',
    manual_test: 'Teste manual',
    agent_offline: 'Agente offline',
    security_alert: 'Segurança',
    software_change: 'Mudança de software',
  };

  return labels[alertType] || alertType;
}

export function OperationalAlertsDashboardCard() {
  const summaryQuery = useOperationalAlertsSummary();
  const alertsQuery = useOperationalAlerts({
    status: 'active',
    limit: 5,
  });

  const summary = summaryQuery.data?.summary;
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
            Alertas operacionais
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Central consolidada de eventos operacionais, falhas e automações.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/operational-alerts"
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
          Carregando alertas operacionais...
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os alertas operacionais.
        </div>
      ) : null}

      {!isLoading && !hasError ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Ativos
              </p>
              <p className="mt-2 text-3xl font-bold text-red-950">
                {summary?.active ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Críticos
              </p>
              <p className="mt-2 text-3xl font-bold text-red-950">
                {summary?.active_critical ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Atenção
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {summary?.active_warning ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Info
              </p>
              <p className="mt-2 text-3xl font-bold text-blue-950">
                {summary?.active_info ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Agentes afetados
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {summary?.agents_with_active_alerts ?? 0}
              </p>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Nenhum alerta operacional ativo no momento.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Alertas ativos recentes
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

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                          {alertTypeLabel(alert.alert_type)}
                        </span>

                        {alert.agent_id ? (
                          <Link
                            to={`/agents/${alert.agent_id}`}
                            className="text-sm font-semibold text-slate-950 hover:text-blue-700"
                          >
                            {alert.hostname || alert.agent_id}
                          </Link>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {alert.title}
                      </p>

                      {alert.description ? (
                        <p className="mt-1 text-sm text-slate-500">
                          {alert.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      <p>Última ocorrência</p>
                      <p className="font-semibold text-slate-700">
                        {formatDate(alert.last_seen_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
