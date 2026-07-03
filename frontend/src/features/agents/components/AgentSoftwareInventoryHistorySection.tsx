import {
  useLatestSoftwareInventoryComparison,
  usePersistedSoftwareInventorySnapshots,
} from '../hooks/usePersistedInventory';

type Props = {
  agentId?: string;
};

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

function SoftwareChangeList({
  title,
  items,
  emptyText,
  type,
}: {
  title: string;
  items: Array<any>;
  emptyText: string;
  type: 'added' | 'removed' | 'changed';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 8).map((item, index) => (
            <div key={`${title}-${item.name}-${index}`} className="px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {item.name || 'Sem nome'}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {item.publisher || 'Fornecedor não informado'} • {sourceLabel(item.source)}
              </p>

              {type === 'changed' ? (
                <p className="mt-2 text-xs text-slate-600">
                  Versão: {item.previous_version || '—'} → {item.latest_version || '—'}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-600">
                  Versão: {item.version || '—'} • Instalação: {item.install_date || '—'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentSoftwareInventoryHistorySection({ agentId }: Props) {
  const snapshotsQuery = usePersistedSoftwareInventorySnapshots({
    agentId,
    limit: 8,
  });

  const comparisonQuery = useLatestSoftwareInventoryComparison({
    agentId,
    limit: 20,
  });

  const snapshots = snapshotsQuery.data?.items || [];
  const comparison = comparisonQuery.data;

  const isLoading = snapshotsQuery.isLoading || comparisonQuery.isLoading;
  const hasError = snapshotsQuery.isError || comparisonQuery.isError;

  const refresh = () => {
    snapshotsQuery.refetch();
    comparisonQuery.refetch();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Histórico e comparação de software
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Compara a última coleta de software com a coleta anterior para identificar mudanças.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Carregando histórico de software...
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o histórico/comparação de software.
        </div>
      ) : null}

      {!isLoading && !hasError ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Adicionados
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">
                {comparison?.summary.added ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Removidos
              </p>
              <p className="mt-2 text-3xl font-bold text-rose-950">
                {comparison?.summary.removed ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Alterados
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {comparison?.summary.changed ?? 0}
              </p>
            </div>
          </div>

          {comparison?.message ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              {comparison.message}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <SoftwareChangeList
              title="Softwares adicionados"
              items={comparison?.added || []}
              emptyText="Nenhum software adicionado entre as últimas coletas."
              type="added"
            />

            <SoftwareChangeList
              title="Softwares removidos"
              items={comparison?.removed || []}
              emptyText="Nenhum software removido entre as últimas coletas."
              type="removed"
            />

            <SoftwareChangeList
              title="Softwares alterados"
              items={comparison?.changed || []}
              emptyText="Nenhum software alterado entre as últimas coletas."
              type="changed"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-slate-900">
                Últimas coletas de software
              </h4>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Nenhum snapshot de software encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Coletado em</th>
                      <th className="px-4 py-3 text-left">Total</th>
                      <th className="px-4 py-3 text-left">Modo</th>
                      <th className="px-4 py-3 text-left">Fontes</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {snapshots.map((snapshot) => {
                      const mode = snapshot.collection_mode || {};
                      const sources = Array.isArray(snapshot.sources)
                        ? snapshot.sources
                        : [];

                      return (
                        <tr key={snapshot.id}>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDate(snapshot.collected_at)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {snapshot.total_items}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            Store/Appx: {mode.include_store_apps ? 'sim' : 'não'} • Package Provider:{' '}
                            {mode.include_package_provider ? 'sim' : 'não'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {sources.length > 0
                              ? sources
                                  .map((item: any) => `${sourceLabel(item.source)}: ${item.count}`)
                                  .join(' • ')
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
