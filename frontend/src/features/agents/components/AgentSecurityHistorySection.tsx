import { usePersistedSecuritySnapshots } from '../hooks/usePersistedInventory';

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

function scoreLabel(score?: number | null) {
  if (score == null) {
    return '—';
  }

  if (score >= 85) {
    return 'Bom';
  }

  if (score >= 60) {
    return 'Atenção';
  }

  return 'Crítico';
}

function scoreDeltaLabel(current?: number | null, previous?: number | null) {
  if (current == null || previous == null) {
    return 'Sem comparação';
  }

  const diff = current - previous;

  if (diff > 0) {
    return `Melhorou +${diff}`;
  }

  if (diff < 0) {
    return `Piorou ${diff}`;
  }

  return 'Sem alteração';
}

export function AgentSecurityHistorySection({ agentId }: Props) {
  const snapshotsQuery = usePersistedSecuritySnapshots({
    agentId,
    limit: 8,
  });

  const snapshots = snapshotsQuery.data?.items || [];
  const current = snapshots[0];
  const previous = snapshots[1];

  const currentScore = current?.security_score ?? null;
  const previousScore = previous?.security_score ?? null;

  const refresh = () => {
    snapshotsQuery.refetch();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Histórico de segurança
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Acompanha a evolução do score e alertas de segurança entre coletas.
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

      {snapshotsQuery.isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Carregando histórico de segurança...
        </div>
      ) : null}

      {snapshotsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o histórico de segurança.
        </div>
      ) : null}

      {!snapshotsQuery.isLoading && !snapshotsQuery.isError ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Score atual
              </p>
              <p className="mt-2 text-3xl font-bold text-blue-950">
                {currentScore ?? '—'}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {scoreLabel(currentScore)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Score anterior
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {previousScore ?? '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {scoreDeltaLabel(currentScore, previousScore)}
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Críticos
              </p>
              <p className="mt-2 text-3xl font-bold text-red-950">
                {current?.critical_alerts ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Atenção
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {current?.warning_alerts ?? 0}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-slate-900">
                Últimas coletas de segurança
              </h4>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Nenhum snapshot de segurança encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Coletado em</th>
                      <th className="px-4 py-3 text-left">Score</th>
                      <th className="px-4 py-3 text-left">Críticos</th>
                      <th className="px-4 py-3 text-left">Atenção</th>
                      <th className="px-4 py-3 text-left">Info</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {snapshots.map((snapshot) => (
                      <tr key={snapshot.id}>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(snapshot.collected_at)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {snapshot.security_score ?? '—'} / {scoreLabel(snapshot.security_score)}
                        </td>
                        <td className="px-4 py-3 text-red-700">
                          {snapshot.critical_alerts ?? 0}
                        </td>
                        <td className="px-4 py-3 text-amber-700">
                          {snapshot.warning_alerts ?? 0}
                        </td>
                        <td className="px-4 py-3 text-blue-700">
                          {snapshot.info_alerts ?? 0}
                        </td>
                      </tr>
                    ))}
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
