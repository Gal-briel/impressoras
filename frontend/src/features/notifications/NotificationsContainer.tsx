import type { AppNotification } from './types';
import { useNotifications } from './useNotifications';

const notificationStyles = {
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: '✅',
  },
  info: {
    wrapper: 'border-blue-200 bg-blue-50 text-blue-900',
    icon: 'ℹ️',
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: '⚠️',
  },
  danger: {
    wrapper: 'border-red-200 bg-red-50 text-red-900',
    icon: '❌',
  },
};

function NotificationCard({ notification }: { notification: AppNotification }) {
  const { removeNotification } = useNotifications();
  const style = notificationStyles[notification.type];

  return (
    <div
      className={[
        'pointer-events-auto w-full max-w-sm rounded-xl border p-4 shadow-lg backdrop-blur',
        'animate-[fadeIn_0.2s_ease-out]',
        style.wrapper,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-lg">{style.icon}</div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{notification.title}</p>

          {notification.message && (
            <p className="mt-1 text-sm opacity-80">{notification.message}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => removeNotification(notification.id)}
          className="rounded-md px-2 py-1 text-xs font-bold opacity-60 hover:bg-white/50 hover:opacity-100"
          aria-label="Fechar notificação"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function NotificationsContainer() {
  const { notifications } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-3">
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
