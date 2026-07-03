import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  useActiveSoftwareInventoryChanges,
  useSoftwareInventoryChangesSummary,
} from '../hooks/useSoftwareInventoryChanges';

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

function sourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    machine_registry: 'Registro da máquina',
    user_registry: 'Registro do usuário',
    package_provider: 'Package Provider',
    appx_store: 'Microsoft Store/Appx',
    unknown: 'Desconhecido',
  };

  return labels[source || 'unknown'] || source || 'Desconhecido';
}

function changeTypeLabel(changeType: string) {
  if (changeType === 'added') {
    return 'Adicionado';
  }

  if (changeType === 'removed') {
    return 'Removido';
  }

  if (changeType === 'changed') {
    return 'Alterado';
  }

  return changeType;
}

function changeBadgeClass(changeType: string) {
  if (changeType === 'added') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (changeType === 'removed') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

const changeTypeOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'added', label: 'Adicionados' },
  { value: 'removed', label: 'Removidos' },
  { value: 'changed', label: 'Alterados' },
];

const sourceOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'machine_registry', label: 'Registro da máquina' },
  { value: 'user_registry', label: 'Registro do usuário' },
  { value: 'package_provider', label: 'Package Provider' },
  { value: 'appx_store', label: 'Microsoft Store/Appx' },
  { value: 'unknown', label: 'Desconhecido' },
];

export function SoftwareInventoryChangesPage() {
  const [changeType, setChangeType] = useState('all');
  const [source, setSource] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const limit = 20;

  const summaryQuery = useSoftwareInventoryChangesSummary();
  const changesQuery = useActiveSoftwareInventoryChanges({
    change_type: changeType,
    source,
    search,
    limit,
    offset,
  });

  const summary = summaryQuery.data?.summary;
  const changes = changesQuery.data?.items || [];
  const total = changesQuery.data?.total || 0;

  const isLoading = summaryQuery.isLoading || changesQuery.isLoading;
  const hasError = summaryQuery.isError || changesQuery.isError;

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  }

  function handleChangeType(value: string) {
    setChangeType(value);
    setOffset(0);
  }

  function handleSource(value: string) {
    setSource(value);
    setOffset(0);
  }

  function refresh() {
    summaryQuery.refetch();
    changesQuery.refetch();
  }

  return (
    <section>
      <PageHeader
        title="Mudanças de software"
        description="Comparação persistida entre a última coleta de software de cada agente e a coleta anterior."
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

        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Adicionados</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary?.added ?? 0}</p>
        </Card>

        <Card className="border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Removidos</p>
          <p className="mt-2 text-3xl font-bold text-rose-950">{summary?.removed ?? 0}</p>
        </Card>

        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Alterados</p>
          <p className="mt-2 text-3xl font-bold text-amber-950">{summary?.changed ?? 0}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agentes afetados</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary?.agents_with_changes ?? 0}</p>
        </Card>
      </div>

      <Card className="mb-6 p-4">
        <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-[180px_240px_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Tipo
            <select
              value={changeType}
              onChange={(event) => handleChangeType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {changeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Origem
            <select
              value={source}
              onChange={(event) => handleSource(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {sourceOptions.map((option) => (
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
              placeholder="Nome do software, fornecedor, origem ou agente..."
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
          Não foi possível carregar as mudanças de software.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Mudanças ativas</h2>
            <p className="text-xs text-slate-500">
              Exibindo {changes.length} de {total} mudança(s).
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-slate-500">Carregando mudanças...</div>
        ) : changes.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Nenhuma mudança ativa encontrada com os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {changes.map((change) => (
              <div key={change.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${changeBadgeClass(change.change_type)}`}
                    >
                      {changeTypeLabel(change.change_type)}
                    </span>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                      {sourceLabel(change.source)}
                    </span>

                    <Link
                      to={`/agents/${change.agent_id}`}
                      className="text-sm font-semibold text-slate-950 hover:text-blue-700"
                    >
                      {change.hostname || change.agent_id}
                    </Link>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-900">{change.name}</p>

                  <p className="mt-1 text-sm text-slate-500">
                    {change.publisher || 'Fornecedor não informado'}
                  </p>

                  {change.change_type === 'changed' ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Versão: {change.previous_version || '—'} → {change.latest_version || '—'}
                    </p>
                  ) : null}

                  {change.change_type === 'added' ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Nova versão detectada: {change.latest_version || '—'}
                    </p>
                  ) : null}

                  {change.change_type === 'removed' ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Versão removida: {change.previous_version || '—'}
                    </p>
                  ) : null}
                </div>

                <div className="text-sm text-slate-500 lg:text-right">
                  <p>Coletado em</p>
                  <p className="font-semibold text-slate-700">{formatDate(change.collected_at)}</p>

                  <p className="mt-3">Último check-in</p>
                  <p className="font-semibold text-slate-700">{formatDate(change.last_seen)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > limit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4 text-sm">
            <span className="text-slate-500">
              Página {Math.floor(offset / limit) + 1} • {total} mudança(s)
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
