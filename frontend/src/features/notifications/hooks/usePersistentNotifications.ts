import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  archiveNotification,
  getNotifications,
  getNotificationsSummary,
  markAllNotificationsRead,
  markNotificationRead,
  syncOperationalAlertNotifications,
} from '../api/notificationsApi';

export function useNotificationsSummary() {
  return useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: getNotificationsSummary,
  });
}

export function usePersistedNotifications(params?: {
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
    search = '',
    limit = 20,
    offset = 0,
  } = params || {};

  return useQuery({
    queryKey: [
      'notifications',
      'list',
      status,
      severity,
      notification_type,
      search,
      limit,
      offset,
    ],
    queryFn: () =>
      getNotifications({
        status,
        severity,
        notification_type,
        search,
        limit,
        offset,
      }),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useArchiveNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSyncOperationalAlertNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncOperationalAlertNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
