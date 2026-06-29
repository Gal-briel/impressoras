import {
  ReactNode,
  createContext,
  useCallback,
  useMemo,
  useState,
} from 'react';

import type { AppNotification, NotificationType } from './types';

type NotifyPayload = {
  type?: NotificationType;
  title: string;
  message?: string;
};

type NotificationsContextValue = {
  notifications: AppNotification[];
  notify: (payload: NotifyPayload) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
};

export const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  notify: () => undefined,
  removeNotification: () => undefined,
  clearNotifications: () => undefined,
});

function createNotificationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback(
    ({ type = 'info', title, message }: NotifyPayload) => {
      const id = createNotificationId();

      const notification: AppNotification = {
        id,
        type,
        title,
        message,
        createdAt: Date.now(),
      };

      setNotifications((current) => [notification, ...current].slice(0, 5));

      window.setTimeout(() => {
        removeNotification(id);
      }, 6000);
    },
    [removeNotification],
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      notify,
      removeNotification,
      clearNotifications,
    }),
    [notifications, notify, removeNotification, clearNotifications],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
