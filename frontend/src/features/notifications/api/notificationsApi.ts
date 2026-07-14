import { api } from '../../../api/httpClient';

export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type NotificationStatus = 'unread' | 'read' | 'archived';

export type PersistedNotification = {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  channel: string;
  notification_type: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  title: string;
  message?: string | null;
  action_url?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  dedupe_key: string;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NotificationsSummary = {
  unread_total: number;
  unread_critical: number;
  unread_warning: number;
  unread_info: number;
  unread_success: number;
  read_total: number;
  archived_total: number;
  total: number;
  last_notification_at?: string | null;
};

export type NotificationsSummaryResponse = {
  summary: NotificationsSummary;
};

export type NotificationsListResponse = {
  items: PersistedNotification[];
  total: number;
  limit: number;
  offset: number;
  status: string;
  severity: string;
  notification_type: string;
  search?: string | null;
};

export type NotificationSyncResponse = {
  opened_or_refreshed: number;
  archived: number;
};

export async function getNotificationsSummary() {
  const { data } = await api.get<NotificationsSummaryResponse>('/notifications/summary');

  return data;
}

export async function getNotifications(params?: {
  status?: string;
  severity?: string;
  notification_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    status = 'unread',
    severity = 'all',
    notification_type = 'all',
    search,
    limit = 20,
    offset = 0,
  } = params || {};

  const { data } = await api.get<NotificationsListResponse>('/notifications', {
    params: {
      status,
      severity,
      notification_type,
      search: search || undefined,
      limit,
      offset,
    },
  });

  return data;
}

export async function markNotificationRead(notificationId: string) {
  const { data } = await api.post<PersistedNotification>(
    `/notifications/${notificationId}/read`,
  );

  return data;
}

export async function archiveNotification(notificationId: string) {
  const { data } = await api.post<PersistedNotification>(
    `/notifications/${notificationId}/archive`,
  );

  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post<{ updated: number }>('/notifications/read-all');

  return data;
}

export async function syncOperationalAlertNotifications() {
  const { data } = await api.post<NotificationSyncResponse>(
    '/notifications/sync/operational-alerts',
  );

  return data;
}
