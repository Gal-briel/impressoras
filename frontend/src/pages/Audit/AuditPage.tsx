import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listAuditLogs } from '../../api/auditApi';
import type { AuditLog } from '../../types/audit';
import { downloadCsv } from '../../utils/csv';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    command_created: 'Comando criado',
    command_executed: 'Comando executado',
    alert_resolved: 'Alerta resolvido',
    alert_ignored: 'Alerta ignorado',
    notification_read: 'Notificação lida',
    notification_archived: 'Notificação arquivada',
    login: 'Login',
    logout: 'Logout',
  };

  return labels[action] || action;
}

function targetTypeLabel(targetType: string) {
  const labels: Record<string, string> = {
    agent: 'Agente',
    command: 'Comando',
    operational_alert: 'Alerta operacional',
    notification: 'Notificação',
    user: 'Usuário',
    tenant: 'Empresa',
  };

  return labels[targetType] || targetType;
}

function shortId(value?: string | null) {
  if (!value) {
    return '-';
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function metadataToText(metadata: unknown) {
  if (!metadata) {
    return '{}';
  }

  if (typeof metadata === 'string') {
    return metadata;
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

function getMetadata(log: AuditLog) {
  const withMetadata = log as AuditLog & {
    metadata?: unknown;
    metadata_payload?: unknown;
  };

  return withMetadata.metadata_payload ?? withMetadata.metadata ?? {};
}

function exportAuditCsv(logs: AuditLog[]) {
  downloadCsv(
    'auditoria.csv',
    logs.map((log) => ({
      acao: actionLabel(log.action),
      acao_original: log.action,
      usuario: log.user_email ?? log.user_id ?? '',
      alvo: `${targetTypeLabel(log.target_type)}:${log.target_id}`,
      tipo_alvo: log.target_type,
      id_alvo: log.target_id,
      ip: log.ip_address ?? '',
      data: log.created_at,
    })),
  );
}

function AuditSummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number | string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function AuditPage() {
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');

  const auditQuery = useQuery({
    queryKey: ['audit', { action, user }],
    queryFn: () =>
      listAuditLogs({
        action: action || undefined,
        user: user || undefined,
        limit: 200,
      }),
  });

  const logs = auditQuery.data?.items ?? [];

  const summary = useMemo(() => {
    const users = new Set<string>();
    const actions = new Set<string>();
    const targets = new Set<string>();

    logs.forEach((log) => {
      if (log.user_email || log.user_id) {
        users.add(log.user_email ?? log.user_id ?? '');
      }

      if (log.action) {
        actions.add(log.action);
      }

      if (log.target_type) {
        targets.add(log.target_type);
      }
    });

    return {
      total: logs.length,
      users: users.size,
      actions: actions.size,
      targets: targets.size,
    };
  }, [logs]);

  function clearFilters() {
    setUser('');
    setAction('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Auditoria</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rastreabilidade de ações do usuário, comandos e alterações
            administrativas.
          </p>
        </div>

        <button
          type="button"
          disabled={!logs.length}
          onClick={() => exportAuditCsv(logs)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Exportar CSV
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AuditSummaryCard title="Registros" value={summary.total} />
        <AuditSummaryCard title="Usuários" value={summary.users} />
        <AuditSummaryCard title="Ações distintas" value={summary.actions} />
        <AuditSummaryCard title="Tipos de alvo" value={summary.targets} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <input
            value={user}
            onChange={(event) => setUser(event.target.value)}
            placeholder="Filtrar por usuário/e-mail"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Filtrar por ação"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {auditQuery.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando auditoria...
        </div>
      ) : null}

      {auditQuery.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          Não foi possível carregar a auditoria.
        </div>
      ) : null}

      {!auditQuery.isLoading && !auditQuery.error && !logs.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Nenhum registro de auditoria encontrado.
        </div>
      ) : null}

      {logs.length ? (
        <div className="space-y-3">
          {logs.map((log) => {
            const metadata = getMetadata(log);

            return (
              <article
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                        {actionLabel(log.action)}
                      </span>

                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {targetTypeLabel(log.target_type)}
                      </span>
                    </div>

                    <h2 className="mt-3 text-base font-bold text-slate-900">
                      {log.user_email || log.user_id || 'Usuário não informado'}
                    </h2>

                    <p className="mt-1 break-all text-sm text-slate-500">
                      Alvo: {targetTypeLabel(log.target_type)} •{' '}
                      {shortId(log.target_id)}
                    </p>

                    {log.ip_address ? (
                      <p className="mt-1 text-sm text-slate-500">
                        IP: {log.ip_address}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm font-medium text-slate-500">
                    {formatDate(log.created_at)}
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                    Ver detalhes técnicos
                  </summary>

                  <div className="border-t border-slate-200 p-4">
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-slate-500">Ação</dt>
                        <dd className="mt-1 break-all text-slate-900">
                          {log.action}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-semibold text-slate-500">
                          Tipo do alvo
                        </dt>
                        <dd className="mt-1 break-all text-slate-900">
                          {log.target_type}
                        </dd>
                      </div>

                      <div className="md:col-span-2">
                        <dt className="font-semibold text-slate-500">
                          ID do alvo
                        </dt>
                        <dd className="mt-1 break-all text-slate-900">
                          {log.target_id}
                        </dd>
                      </div>
                    </dl>

                    <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                      {metadataToText(metadata)}
                    </pre>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
