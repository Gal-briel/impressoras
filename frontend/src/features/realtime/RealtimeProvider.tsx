import {
  ReactNode,
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useNotifications } from '../notifications/useNotifications';
import type { NotificationType } from '../notifications/types';
import type { RealtimeConnectionStatus, RealtimeEvent } from './types';

type RealtimeContextValue = {
  status: RealtimeConnectionStatus;
  lastEvent: RealtimeEvent | null;
  lastMessageAt: Date | null;
};

export const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disabled',
  lastEvent: null,
  lastMessageAt: null,
});

function getRealtimeUrl(token: string) {
  const apiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1';

  if (apiBase.startsWith('http')) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/dashboard/ws`;
    url.searchParams.set('token', token);
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = `${apiBase.startsWith('/') ? apiBase : `/${apiBase}`}`.replace(/\/$/, '');

  return `${protocol}//${window.location.host}${path}/dashboard/ws?token=${encodeURIComponent(
    token,
  )}`;
}

function invalidateByEvent(queryClient: ReturnType<typeof useQueryClient>, event: RealtimeEvent) {
  const eventType = String(event.type || '').toLowerCase();
  const agentId = event.data?.agent_id;

  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });

  if (eventType.includes('agent')) {
    queryClient.invalidateQueries({ queryKey: ['agents'] });

    if (agentId) {
      queryClient.invalidateQueries({ queryKey: ['agents', agentId] });
    }
  }

  if (eventType.includes('command')) {
    queryClient.invalidateQueries({ queryKey: ['commands'] });

    if (agentId) {
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'commands'] });
    }
  }

  if (eventType.includes('event')) {
    if (agentId) {
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'events'] });
    }
  }
}

function getEventNotification(event: RealtimeEvent): {
  type: NotificationType;
  title: string;
  message?: string;
} | null {
  const eventType = String(event.type || '').toLowerCase();
  const agentId = event.data?.agent_id;
  const commandId = event.data?.command_id;
  const status = String(event.data?.status || '').toLowerCase();

  if (eventType.includes('agent_online') || eventType === 'agent.online') {
    return {
      type: 'success',
      title: 'Agente online',
      message: agentId ? `Agente ${agentId} voltou a responder.` : 'Um agente voltou a responder.',
    };
  }

  if (eventType.includes('agent_offline') || eventType === 'agent.offline') {
    return {
      type: 'warning',
      title: 'Agente offline',
      message: agentId ? `Agente ${agentId} ficou offline.` : 'Um agente ficou offline.',
    };
  }

  if (eventType.includes('command')) {
    if (
      eventType.includes('failed') ||
      eventType.includes('error') ||
      eventType.includes('timeout') ||
      ['failed', 'timed_out', 'timeout', 'expired'].includes(status)
    ) {
      return {
        type: 'danger',
        title: 'Comando falhou',
        message: commandId
          ? `Comando ${commandId} não finalizou corretamente.`
          : 'Um comando não finalizou corretamente.',
      };
    }

    if (
      eventType.includes('success') ||
      eventType.includes('finished') ||
      eventType.includes('completed') ||
      status === 'success'
    ) {
      return {
        type: 'success',
        title: 'Comando concluído',
        message: commandId
          ? `Comando ${commandId} finalizado com sucesso.`
          : 'Um comando foi finalizado com sucesso.',
      };
    }

    if (eventType.includes('created') || eventType.includes('queued')) {
      return {
        type: 'info',
        title: 'Comando criado',
        message: commandId
          ? `Comando ${commandId} foi enviado para a fila.`
          : 'Um novo comando foi enviado para a fila.',
      };
    }

    return {
      type: 'info',
      title: 'Comando atualizado',
      message: commandId
        ? `Comando ${commandId} recebeu uma atualização.`
        : 'Um comando recebeu uma atualização.',
    };
  }

  if (eventType.includes('event')) {
    return {
      type: 'info',
      title: 'Novo evento do agente',
      message: agentId
        ? `O agente ${agentId} enviou um novo evento.`
        : 'Um agente enviou um novo evento.',
    };
  }

  return null;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  useLocation();

  const queryClient = useQueryClient();
  const { notify } = useNotifications();

  const [status, setStatus] = useState<RealtimeConnectionStatus>('disabled');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  useEffect(() => {
    if (!token) {
      setStatus('disabled');
      return;
    }

    let active = true;

    function clearTimers() {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    }

    function connect() {
      if (!active || !token) {
        return;
      }

      clearTimers();

      const url = getRealtimeUrl(token);
      const socket = new WebSocket(url);

      socketRef.current = socket;

      setStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

      socket.onopen = () => {
        if (!active) {
          return;
        }

        reconnectAttemptRef.current = 0;
        setStatus('connected');
        notify({
          type: 'success',
          title: 'Tempo real conectado',
          message: 'O painel está recebendo atualizações automaticamente.',
        });

        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, 25000);
      };

      socket.onmessage = (message) => {
        if (!active || typeof message.data !== 'string') {
          return;
        }

        try {
          const event = JSON.parse(message.data) as RealtimeEvent;

          setLastEvent(event);
          setLastMessageAt(new Date());

          invalidateByEvent(queryClient, event);

          const notification = getEventNotification(event);

          if (notification) {
            notify(notification);
          }
        } catch {
          // Ignora mensagens que não são JSON.
        }
      };

      socket.onerror = () => {
        if (!active) {
          return;
        }

        setStatus('error');
        socket.close();
      };

      socket.onclose = () => {
        clearTimers();

        if (!active) {
          return;
        }

        reconnectAttemptRef.current += 1;

        const delay = Math.min(30000, 2000 * reconnectAttemptRef.current);

        setStatus(reconnectAttemptRef.current > 1 ? 'reconnecting' : 'disconnected');

        if (reconnectAttemptRef.current === 1) {
          notify({
            type: 'warning',
            title: 'Tempo real desconectado',
            message: 'Tentando reconectar automaticamente.',
          });
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };
    }

    connect();

    return () => {
      active = false;
      clearTimers();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [token, queryClient, notify]);

  const value = useMemo(
    () => ({
      status,
      lastEvent,
      lastMessageAt,
    }),
    [status, lastEvent, lastMessageAt],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
