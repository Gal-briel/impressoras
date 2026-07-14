import { Link, useNavigate } from 'react-router-dom';

import {
  useNotificationsSummary,
  usePersistedNotifications,
  useMarkNotificationRead,
} from '../../notifications/hooks/usePersistentNotifications';

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

export function NotificationsDashboardCard() {
  const navigate = useNavigate();
  const summaryQuery = useNotificationsSummary();
  const markReadMutation = useMarkNotificationRead();
  const notificationsQuery = usePersistedNotifications({
    status: 'unread',
    severity: 'all',
    notification_type: 'all',
    limit: 5,
    offset: 0,
  });

  const summary = summaryQuery.data?.summary;
  const notifications = notificationsQuery.data?.items ?? [];

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

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Notificações recentes
          </h2>
          <p className="text-sm text-slate-500">
            Pendências internas geradas pelo sistema.
          </p>
        </div>

        <Link
          to="/notifications"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Ver todas
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-slate-100 p-4">
        <div>
          <div className="text-xs text-slate-500">Não lidas</div>
          <div className="text-xl font-bold text-slate-900">
            {summary?.unread_total ?? 0}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">Atenção</div>
          <div className="text-xl font-bold text-amber-700">
            {summary?.unread_warning ?? 0}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">Críticas</div>
          <div className="text-xl font-bold text-red-700">
            {summary?.unread_critical ?? 0}
          </div>
        </div>
      </div>

      {notificationsQuery.isLoading ? (
        <div className="p-4 text-sm text-slate-500">
          Carregando notificações...
        </div>
      ) : notificationsQuery.isError ? (
        <div className="p-4 text-sm text-red-600">
          Não foi possível carregar notificações.
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">
          Nenhuma notificação não lida.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => (
            <article key={notification.id} className="p-4">
              <div className="mb-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadgeClass(
                    notification.severity,
                  )}`}
                >
                  {severityLabel(notification.severity)}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {notification.notification_type === 'operational_alert'
                    ? 'Alerta operacional'
                    : 'Sistema'}
                </span>
              </div>

              <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                {notification.title}
              </h3>

              {notification.message ? (
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {notification.message}
                </p>
              ) : null}

              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{formatDate(notification.created_at)}</span>

                {notification.action_url ? (
                  <button
                    type="button"
                    onClick={() =>
                      openNotification(notification.id, notification.action_url)
                    }
                    className="font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Abrir
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
