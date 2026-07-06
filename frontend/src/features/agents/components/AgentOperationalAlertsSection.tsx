import { Link } from 'react-router-dom';

import { useOperationalAlerts } from '../../operationalAlerts/hooks/useOperationalAlerts';
import {
  alertTypeLabel,
  formatDate,
  severityBadgeClass,
  severityLabel,
  statusBadgeClass,
  statusLabel,
} from '../../operationalAlerts/utils/operationalAlertTaxonomy';

type Props = {
  agentId?: string;
};

export function AgentOperationalAlertsSection({ agentId }: Props) {
  const alertsQuery = useOperationalAlerts({
    agent_id: agentId,
    status: 'active',
    severity: 'all',
    alert_type: 'all',
    limit: 5,
    offset: 0,
  });

  const alerts = alertsQuery.data?.items ?? [];
  const total = alertsQuery.data?.total ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Alertas operacionais do agente
          </h2>
          <p className="text-sm text-slate-500">
            Consolida falhas de comando, agente offline, segurança e mudanças de software.
          </p>
        </div>

        <Link
          to={`/operational-alerts?agent_id=${agentId ?? ''}`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Ver na central
        </Link>
      </div>

      {alertsQuery.isLoading ? (
        <div className="p-4 text-sm text-slate-500">
          Carregando alertas operacionais...
        </div>
      ) : alertsQuery.isError ? (
        <div className="p-4 text-sm text-red-600">
          Não foi possível carregar os alertas operacionais deste agente.
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">
          Nenhum alerta operacional ativo para este agente.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {alerts.map((alert) => (
            <div key={alert.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {alertTypeLabel(alert.alert_type)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadgeClass(
                        alert.severity,
                      )}`}
                    >
                      {severityLabel(alert.severity)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                        alert.status,
                      )}`}
                    >
                      {statusLabel(alert.status)}
                    </span>
                  </div>

                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {alert.title}
                  </h3>

                  {alert.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {alert.description}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-left text-xs text-slate-500 sm:text-right">
                  <div>Primeiro registro</div>
                  <div className="font-medium text-slate-700">
                    {formatDate(alert.first_seen_at || alert.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        Exibindo até 5 alertas ativos. Total ativo encontrado: {total}.
      </div>
    </section>
  );
}
