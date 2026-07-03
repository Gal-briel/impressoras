import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useActiveSecurityAlerts, useSecurityAlertsSummary } from '../hooks/useSecurityAlerts';

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

const severityOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'Crítico' },
  { value: 'warning', label: 'Atenção' },
  { value: 'info', label: 'Info' },
];

const categoryOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'bitlocker', label: 'BitLocker' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'defender', label: 'Defender' },
  { value: 'antivirus', label: 'Antivírus' },
  { value: 'updates', label: 'Atualizações' },
  { value: 'local_users', label: 'Usuários locais' },
  { value: 'local_administrators', label: 'Administradores locais' },
];

export function SecurityAlertsPage() {
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const limit = 20;

  const summaryQuery = useSecurityAlertsSummary();
  const alertsQuery = useActiveSecurityAlerts({
    severity,
    category,
    search,
    limit,
    offset,
  });

  const summary = summaryQuery.data?.summary;
  const alerts = alertsQuery.data?.items || [];
  const total = alertsQuery.data?.total || 0;

  const isLoading = summaryQuery.isLoading || alertsQuery.isLoading;
  const hasError = summaryQuery.isError || alertsQuery.isError;

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  }

  function handleSeverityChange(value: string) {
    setSeverity(value);
    setOffset(0);
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setOffset(0);
  }

  function refresh() {
    summaryQuery.refetch();
    alertsQuery.refetch();
  }

  return (
    <section>
      <PageHeader
        title="Alertas de segurança"
        description="Lista de alertas ativos gerados a partir da última coleta de segurança de cada agente."
        actions={
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Atualizar
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.total ?? 0}</p>
        </Card>

        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Críticos</p>
          <p className="mt-2 text-3xl font-bold text-red-950">{summary?.critical ?? 0}</p>
        </Card>

        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Atenção</p>
          <p className="mt-2 text-3xl font-bold text-amber-950">{summary?.warning ?? 0}</p>
        </Card>

        <Card className="border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Info</p>
          <p className="mt-2 text-3xl font-bold text-blue-950">{summary?.info ?? 0}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agentes afetados</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.agents_with_alerts ?? 0}</p>
        </Card>
      </div>

      <Card className="mb-6 p-4">
        <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-[180px_220px_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Severidade
            <select
              value={severity}
              onChange={(event) => handleSeverityChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Categoria
            <select
              value={category}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Buscar
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Agente, título, descrição ou categoria..."
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
          Não foi possível carregar os alertas de segurança.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Alertas ativos</h2>
            <p className="text-xs text-slate-500">
              Exibindo {alerts.length} de {total} alerta(s).
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-slate-500">Carregando alertas...</div>
        ) : alerts.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Nenhum alerta ativo encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div key={alert.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_220px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityBadgeClass(alert.severity)}`}
                    >
                      {severityLabel(alert.severity)}
                    </span>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                      {alert.category}
                    </span>

                    <Link
                      to={`/agents/${alert.agent_id}`}
                      className="text-sm font-semibold text-slate-950 hover:text-blue-700"
                    >
                      {alert.hostname || alert.agent_id}
                    </Link>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-900">{alert.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{alert.description}</p>

                  <p className="mt-2 text-xs text-slate-400">
                    Snapshot: {alert.snapshot_id}
                  </p>
                </div>

                <div className="text-sm text-slate-500 lg:text-right">
                  <p>Coletado em</p>
                  <p className="font-semibold text-slate-700">{formatDate(alert.collected_at)}</p>

                  <p className="mt-3">Último check-in</p>
                  <p className="font-semibold text-slate-700">{formatDate(alert.last_seen)}</p>
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
