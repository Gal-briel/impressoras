import {
  useAgentActiveSoftwareInventoryChanges,
  useAgentSoftwareInventoryChangesSummary,
} from '../../softwareInventoryChanges/hooks/useSoftwareInventoryChanges';

type Props = {
  agentId: string;
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

function changeTypeLabel(changeType: string) {
  if (changeType === 'added') {
    return 'Adicionado';
  }

  if (changeType === 'removed') {
    return 'Removido';
  }

  return 'Alterado';
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

export function AgentSoftwareChangesSection({ agentId }: Props) {
  const summaryQuery = useAgentSoftwareInventoryChangesSummary(agentId);
  const changesQuery = useAgentActiveSoftwareInventoryChanges(agentId, {
    limit: 10,
  });

  const summary = summaryQuery.data?.summary;
  const changes = changesQuery.data?.items || [];

  const isLoading = summaryQuery.isLoading || changesQuery.isLoading;
  const hasError = summaryQuery.isError || changesQuery.isError;

  const refresh = () => {
    summaryQuery.refetch();
    changesQuery.refetch();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Mudanças de software deste agente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Alterações persistidas entre a última coleta de software e a coleta anterior.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Carregando mudanças de software...
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar as mudanças de software deste agente.
        </div>
      ) : null}

      {!isLoading && !hasError ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {summary?.total ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Adicionados
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">
                {summary?.added ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Removidos
              </p>
              <p className="mt-2 text-3xl font-bold text-rose-950">
                {summary?.removed ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Alterados
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {summary?.changed ?? 0}
              </p>
            </div>
          </div>

          {changes.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Nenhuma mudança ativa de software encontrada para este agente.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="divide-y divide-slate-100">
                {changes.map((change) => (
                  <div key={change.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
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
                      </div>

                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {change.name}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {change.publisher || 'Fornecedor não informado'}
                      </p>

                      {change.change_type === 'changed' ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Versão: {change.previous_version || '—'} → {change.latest_version || '—'}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      <p>{formatDate(change.collected_at)}</p>
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
