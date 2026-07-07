import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsSummary,
  usePersistedNotifications,
  useSyncOperationalAlertNotifications,
} from '../hooks/usePersistentNotifications';

const statusOptions = [
  { value: 'unread', label: 'Não lidas' },
  { value: 'read', label: 'Lidas' },
  { value: 'archived', label: 'Arquivadas' },
  { value: 'all', label: 'Todas' },
];

const severityOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'Crítico' },
  { value: 'warning', label: 'Atenção' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Sucesso' },
];

const typeOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'operational_alert', label: 'Alerta operacional' },
  { value: 'system', label: 'Sistema' },
];

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
  if (severity === 'critical') return 'Crítico';
  if (severity === 'warning') return 'Atenção';
  if (severity === 'info') return 'Info';
  if (severity === 'success') return 'Sucesso';

  return severity;
}

function severityBadgeClass(severity: string) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (severity === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function statusLabel(status: string) {
  if (status === 'unread') return 'Não lida';
  if (status === 'read') return 'Lida';
  if (status === 'archived') return 'Arquivada';

  return status;
}

function statusBadgeClass(status: string) {
  if (status === 'unread') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'read') return 'border-blue-200 bg-blue-50 text-blue-700';

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function typeLabel(type: string) {
  if (type === 'operational_alert') return 'Alerta operacional';
  if (type === 'system') return 'Sistema';

  return type;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('unread');
  const [severity, setSeverity] = useState('all');
  const [notificationType, setNotificationType] = useState('all');
  const [search, setSearch] = useState('');

  const summaryQuery = useNotificationsSummary();
  const notificationsQuery = usePersistedNotifications({
    status,
    severity,
    notification_type: notificationType,
    search,
    limit: 50,
    offset: 0,
  });

  const markReadMutation = useMarkNotificationRead();
  const archiveMutation = useArchiveNotification();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const syncMutation = useSyncOperationalAlertNotifications();

  const summary = summaryQuery.data?.summary;
  const notifications = notificationsQuery.data?.items ?? [];
  const isMutating =
    markReadMutation.isPending ||
    archiveMutation.isPending ||
    markAllReadMutation.isPending ||
    syncMutation.isPending;

  function refresh() {
    summaryQuery.refetch();
    notificationsQuery.refetch();
  }

  function syncOperationalAlerts() {
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        window.alert(
          `Sincronização concluída. Abertas/atualizadas: ${result.opened_or_refreshed}. Arquivadas: ${result.archived}.`,
        );
      },
    });
  }

  function openNotification(notificationId: string, actionUrl?: string | null) {
    if (!actionUrl) {
      return;
    }

    markReadMutation.mutate(notificationId, {
      onSettled: () => {
        navigate(actionUrl);
      },
    });
  }

  function markAllRead() {
    markAllReadMutation.mutate(undefined, {
      onSuccess: (result) => {
        window.alert(`Notificações marcadas como lidas: ${result.updated}.`);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notificações</h1>
          <p className="text-sm text-slate-500">
            Histórico persistido de notificações internas do sistema.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={syncOperationalAlerts}
            disabled={syncMutation.isPending}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar alertas'}
          </button>

          <button
            type="button"
            onClick={markAllRead}
            disabled={markAllReadMutation.isPending}
            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markAllReadMutation.isPending ? 'Marcando...' : 'Marcar todas como lidas'}
          </button>

          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Não lidas</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {summary?.unread_total ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Atenção</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">
            {summary?.unread_warning ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Lidas</div>
          <div className="mt-1 text-2xl font-bold text-blue-700">
            {summary?.read_total ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Arquivadas</div>
          <div className="mt-1 text-2xl font-bold text-slate-700">
            {summary?.archived_total ?? 0}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Severidade
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Tipo
            <select
              value={notificationType}
              onChange={(event) => setNotificationType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Busca
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou mensagem"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      {notificationsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar as notificações.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            Lista de notificações
          </h2>
          <p className="text-sm text-slate-500">
            Total encontrado: {notificationsQuery.data?.total ?? 0}
          </p>
        </div>

        {notificationsQuery.isLoading ? (
          <div className="p-4 text-sm text-slate-500">Carregando notificações...</div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Nenhuma notificação encontrada para os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <article key={notification.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {typeLabel(notification.notification_type)}
                      </span>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadgeClass(
                          notification.severity,
                        )}`}
                      >
                        {severityLabel(notification.severity)}
                      </span>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                          notification.status,
                        )}`}
                      >
                        {statusLabel(notification.status)}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900">
                      {notification.title}
                    </h3>

                    {notification.message ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {notification.message}
                      </p>
                    ) : null}

                    <div className="mt-2 text-xs text-slate-500">
                      Criada em {formatDate(notification.created_at)}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {notification.action_url ? (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() =>
                          openNotification(notification.id, notification.action_url)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Abrir
                      </button>
                    ) : null}

                    {notification.status === 'unread' ? (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => markReadMutation.mutate(notification.id)}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Marcar lida
                      </button>
                    ) : null}

                    {notification.status !== 'archived' ? (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => archiveMutation.mutate(notification.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Arquivar
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
