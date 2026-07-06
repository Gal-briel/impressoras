import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  useIgnoreOperationalAlert,
  useOperationalAlerts,
  useOperationalAlertsSummary,
  useResolveOperationalAlert,
  useSyncAllOperationalAlerts,
  useSyncOfflineAgentAlerts,
  useSyncSoftwareChangeAlerts,
} from '../hooks/useOperationalAlerts';
import {
  alertTypeLabel,
  alertTypeOptions,
  formatDate,
  severityBadgeClass,
  severityLabel,
  severityOptions,
  statusBadgeClass,
  statusLabel,
  statusOptions,
} from '../utils/operationalAlertTaxonomy';

export function OperationalAlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const agentIdFilter = searchParams.get('agent_id') || undefined;
  const [statusFilter, setStatusFilter] = useState('active');
  const [severity, setSeverity] = useState('all');
  const [alertType, setAlertType] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const limit = 20;

  const summaryQuery = useOperationalAlertsSummary();
  const alertsQuery = useOperationalAlerts({
    status: statusFilter,
    severity,
    alert_type: alertType,
    search,
    limit,
    offset,
  });

  const resolveMutation = useResolveOperationalAlert();
  const ignoreMutation = useIgnoreOperationalAlert();
  const syncAllMutation = useSyncAllOperationalAlerts();
  const syncOfflineMutation = useSyncOfflineAgentAlerts();
  const syncSoftwareMutation = useSyncSoftwareChangeAlerts();

  const summary = summaryQuery.data?.summary;
  const alerts = alertsQuery.data?.items || [];
  const total = alertsQuery.data?.total || 0;

  const isLoading = summaryQuery.isLoading || alertsQuery.isLoading;
  const hasError = summaryQuery.isError || alertsQuery.isError;
  const isMutating =
    resolveMutation.isPending ||
    ignoreMutation.isPending ||
    syncAllMutation.isPending ||
    syncOfflineMutation.isPending ||
    syncSoftwareMutation.isPending;

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  }

  function handleStatus(value: string) {
    setStatusFilter(value);
    setOffset(0);
  }

  function handleSeverity(value: string) {
    setSeverity(value);
    setOffset(0);
  }

  function handleAlertType(value: string) {
    setAlertType(value);
    setOffset(0);
  }

  function clearAgentFilter() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('agent_id');
    setSearchParams(nextParams);
  }

  function refresh() {
    summaryQuery.refetch();
    alertsQuery.refetch();
  }

  function syncOfflineAgents() {
    syncOfflineMutation.mutate(
      {
        offlineAfterMinutes: 15,
      },
      {
        onSuccess: (result) => {
          window.alert(
            `Sincronização concluída. Abertos/atualizados: ${result.opened_or_refreshed}. Resolvidos: ${result.resolved}.`,
          );
        },
      },
    );
  }

  function syncAllAlerts() {
    syncAllMutation.mutate(15, {
      onSuccess: (result) => {
        window.alert(
          `Sincronização geral concluída. Abertos/atualizados: ${result.totals.opened_or_refreshed}. Resolvidos: ${result.totals.resolved}.`,
        );
      },
    });
  }

  function syncSoftwareChanges() {
    syncSoftwareMutation.mutate(undefined, {
      onSuccess: (result) => {
        window.alert(
          `Sincronização de software concluída. Abertos/atualizados: ${result.opened_or_refreshed}. Resolvidos: ${result.resolved}.`,
        );
      },
    });
  }

  function resolveAlert(alertId: string) {
    const note = window.prompt('Observação da resolução:', 'Resolvido manualmente pela central de alertas.');

    if (note === null) {
      return;
    }

    resolveMutation.mutate({
      alertId,
      note,
    });
  }

  function ignoreAlert(alertId: string) {
    const note = window.prompt('Motivo para ignorar:', 'Ignorado manualmente pela central de alertas.');

    if (note === null) {
      return;
    }

    ignoreMutation.mutate({
      alertId,
      note,
    });
  }

  return (
    <section>
      <PageHeader
        title="Alertas operacionais"
        description="Central de alertas gerados por falhas, eventos operacionais e automações do Gabriel."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={syncOfflineAgents}
              disabled={syncOfflineMutation.isPending}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncOfflineMutation.isPending ? 'Sincronizando...' : 'Sincronizar offline'}
            </button>

            <button
              type="button"
              onClick={syncAllAlerts}
              disabled={syncAllMutation.isPending}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncAllMutation.isPending ? 'Sincronizando...' : 'Sincronizar tudo'}
            </button>

            <button
              type="button"
              onClick={syncSoftwareChanges}
              disabled={syncSoftwareMutation.isPending}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncSoftwareMutation.isPending ? 'Sincronizando...' : 'Sincronizar software'}
            </button>

            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.total ?? 0}</p>
        </Card>

        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Ativos</p>
          <p className="mt-2 text-3xl font-bold text-red-950">{summary?.active ?? 0}</p>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Resolvidos</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary?.resolved ?? 0}</p>
        </Card>

        <Card className="border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ignorados</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.ignored ?? 0}</p>
        </Card>

        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Críticos ativos</p>
          <p className="mt-2 text-3xl font-bold text-red-950">{summary?.active_critical ?? 0}</p>
        </Card>

        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Atenção ativos</p>
          <p className="mt-2 text-3xl font-bold text-amber-950">{summary?.active_warning ?? 0}</p>
        </Card>

        <Card className="border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Info ativos</p>
          <p className="mt-2 text-3xl font-bold text-blue-950">{summary?.active_info ?? 0}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agentes afetados</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.agents_with_active_alerts ?? 0}</p>
        </Card>
      </div>

      <Card className="mb-6 p-4">
        <form onSubmit={handleSearch} className="grid gap-3 xl:grid-cols-[160px_160px_220px_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={statusFilter}
              onChange={(event) => handleStatus(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Severidade
            <select
              value={severity}
              onChange={(event) => handleSeverity(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Tipo
            <select
              value={alertType}
              onChange={(event) => handleAlertType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {alertTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Buscar
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Título, descrição, tipo, agente ou dedupe..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Filtrar
            </button>
          </div>
        </form>
      </Card>

      {hasError ? (
        <Card className="mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os alertas operacionais.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Lista de alertas</h2>
            <p className="text-xs text-slate-500">
              Exibindo {alerts.length} de {total} alerta(s).
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-slate-500">Carregando alertas operacionais...</div>
        ) : alerts.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Nenhum alerta encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div key={alert.id} className="grid gap-4 p-4 xl:grid-cols-[1fr_260px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(alert.status)}`}>
                      {statusLabel(alert.status)}
                    </span>

                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityBadgeClass(alert.severity)}`}>
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

                  <p className="mt-3 text-sm font-semibold text-slate-900">{alert.title}</p>

                  {alert.description ? (
                    <p className="mt-1 text-sm text-slate-500">{alert.description}</p>
                  ) : null}

                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <p>Dedupe: {alert.dedupe_key}</p>
                    {alert.source_type ? <p>Origem: {alert.source_type}</p> : null}
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-500 xl:text-right">
                  <div>
                    <p>Primeiro visto</p>
                    <p className="font-semibold text-slate-700">{formatDate(alert.first_seen_at)}</p>
                  </div>

                  <div>
                    <p>Última ocorrência</p>
                    <p className="font-semibold text-slate-700">{formatDate(alert.last_seen_at)}</p>
                  </div>

                  {alert.resolved_at ? (
                    <div>
                      <p>Resolvido em</p>
                      <p className="font-semibold text-emerald-700">{formatDate(alert.resolved_at)}</p>
                    </div>
                  ) : null}

                  {alert.ignored_at ? (
                    <div>
                      <p>Ignorado em</p>
                      <p className="font-semibold text-slate-700">{formatDate(alert.ignored_at)}</p>
                    </div>
                  ) : null}

                  {alert.status === 'active' ? (
                    <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => resolveAlert(alert.id)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resolver
                      </button>

                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => ignoreAlert(alert.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ignorar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > limit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4 text-sm">
            <span className="text-slate-500">
              Página {Math.floor(offset / limit) + 1} • {total} alerta(s)
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>

              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
