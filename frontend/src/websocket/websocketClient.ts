import { env } from '../utils/env';
import type { DashboardEvent } from './types';

export type WebSocketListener = (event: DashboardEvent) => void;

export class DashboardWebSocketClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<WebSocketListener>();
  private retryTimeout: number | null = null;

  connect(token: string) {
    if (!token || this.socket?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const baseUrl = env.wsUrl.startsWith('ws') ? env.wsUrl : `${protocol}//${host}${env.wsUrl}`;
    const url = `${baseUrl}?token=${encodeURIComponent(token)}`;

    this.socket = new WebSocket(url);
    this.socket.onmessage = (message) => {
      try {
        this.emit(JSON.parse(message.data) as DashboardEvent);
      } catch {
        this.emit({ type: 'unknown', payload: { raw: message.data } });
      }
    };
    this.socket.onclose = () => {
      this.socket = null;
      if (!this.retryTimeout) {
        this.retryTimeout = window.setTimeout(() => {
          this.retryTimeout = null;
          this.connect(token);
        }, 5000);
      }
    };
  }

  disconnect() {
    if (this.retryTimeout) window.clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
    this.socket?.close();
    this.socket = null;
  }

  subscribe(listener: WebSocketListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DashboardEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

export const dashboardWebSocket = new DashboardWebSocketClient();
