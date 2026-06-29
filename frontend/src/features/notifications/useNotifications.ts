import { useContext } from 'react';

import { NotificationsContext } from './NotificationsProvider';

export function useNotifications() {
  return useContext(NotificationsContext);
}
