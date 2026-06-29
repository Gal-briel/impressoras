import type { AgentStatusFilter } from '../types';

type AgentsFiltersProps = {
  search: string;
  status: AgentStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: AgentStatusFilter) => void;
};

export function AgentsFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
}: AgentsFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_220px]">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Buscar agente
        </span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Hostname, IP, versão ou sistema operacional"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Status
        </span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as AgentStatusFilter)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">Todos</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="approved">Aprovado</option>
          <option value="pending">Pendente</option>
          <option value="revoked">Revogado</option>
        </select>
      </label>
    </div>
  );
}
