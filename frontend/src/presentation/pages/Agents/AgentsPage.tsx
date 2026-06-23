// frontend/src/presentation/pages/Agents/AgentsPage.tsx
import { useState, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAgents } from '../../../application/hooks/useAgents';
import { useAppWebSocket } from '../../../infrastructure/ws/webSocketClient';

export const AgentsPage = () => {
  const [filters, setFilters] = useState({ search: '', status: '', page: 1, limit: 50 });
  const { data, isLoading } = useAgents(filters);
  const { lastMessage } = useAppWebSocket();
  const parentRef = useRef<HTMLDivElement>(null);

  const agents = data?.items ?? [];

  // Reatividade em tempo real
  useEffect(() => {
    if (lastMessage?.type === 'agent_status_changed') {
      // Idealmente atualiza o cache do React Query aqui
    }
  }, [lastMessage]);

  const rowVirtualizer = useVirtualizer({
    count: agents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Agentes</h1>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Buscar hostname ou MAC..."
            className="px-4 py-2 border rounded-md shadow-sm w-80 focus:ring-2 focus:ring-blue-500 outline-none"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
          <select
            className="px-4 py-2 border rounded-md shadow-sm outline-none"
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Todos os Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      <div className="flex-1 bg-white border rounded-lg shadow overflow-hidden flex flex-col">
        {/* Table Header: Grid de 6 colunas */}
        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b bg-slate-100 font-semibold text-slate-600 text-sm">
          <div>Hostname</div>
          <div>Status</div>
          <div>MAC Address</div>
          <div>OS Version</div>
          <div>Agent Version</div>
          <div>Ações</div>
        </div>

        {/* Virtualized Table Body */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">Carregando agentes...</div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const agent = agents[virtualRow.index];
                return (
                  // Row: Grid de 6 colunas para alinhar com o cabeçalho
                  <div
                    key={agent.id}
                    className="absolute top-0 left-0 w-full grid grid-cols-6 gap-4 px-6 items-center border-b hover:bg-slate-50 transition-colors"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="font-medium text-slate-800">{agent.hostname}</div>
                    <div>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        agent.calculated_status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {agent.calculated_status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono text-sm">{agent.mac_address}</div>
                    <div className="text-slate-500 truncate">{agent.os_version}</div>
                    
                    {/* Exibição do agent_version */}
                    <div className="text-slate-500 font-mono text-sm">
                      v{agent.agent_version}
                    </div>

                    <div>
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Detalhes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};