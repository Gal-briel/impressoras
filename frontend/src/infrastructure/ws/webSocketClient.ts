// frontend/src/infrastructure/ws/webSocketClient.ts
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../application/store/authStore';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export const useAppWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/dashboard/ws';
    // Utilizando token via query string para conexão inicial segura no navegador
    ws.current = new WebSocket(`${wsUrl}?token=${token}`);

    ws.current.onopen = () => setIsConnected(true);
    ws.current.onclose = () => setIsConnected(false);
    
    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Salva a última mensagem para componentes que queiram reagir localmente (ex: exibir Toasts)
        setLastMessage(msg);

        // Lógica GLOBAL de atualização de cache para o Dashboard
        switch (msg.type) {
          case 'agent_online':
          case 'agent_offline':
            // Atualiza o status do agente no cache local sem refetch
            // (Se tiver vários filtros/páginas em cache, idealmente use queryClient.setQueriesData)
            queryClient.setQueryData(['agents', { page: 1, limit: 50 }], (oldData: any) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                items: oldData.items.map((agent: any) => 
                  agent.id === msg.data?.agent_id 
                    ? { ...agent, calculated_status: msg.type === 'agent_online' ? 'online' : 'offline' }
                    : agent
                )
              };
            });
            break;
            
          case 'command_finished':
            // Invalida a lista de comandos para forçar um refetch e buscar o status mais atualizado
            queryClient.invalidateQueries({ queryKey: ['commands'] });
            break;
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [token, queryClient]);

  return { isConnected, lastMessage };
};