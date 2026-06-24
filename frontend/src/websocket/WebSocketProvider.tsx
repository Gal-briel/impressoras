import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { dashboardWebSocket } from './websocketClient';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      dashboardWebSocket.disconnect();
      return;
    }

    dashboardWebSocket.connect(token);
    const unsubscribe = dashboardWebSocket.subscribe((event) => {
      if (['agent_online', 'agent_offline'].includes(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['agents'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
      if (['command_created', 'command_finished'].includes(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['commands'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, token]);

  return <>{children}</>;
}
