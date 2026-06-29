export type NotificationType = 'success' | 'info' | 'warning' | 'danger';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: number;
};
