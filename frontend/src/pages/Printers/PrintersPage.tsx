import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPrinters } from '../../api/printerApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { downloadCsv } from '../../utils/exportCsv';

export function PrintersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const printersQuery = useQuery({ queryKey: ['printers', { search, status }], queryFn: () => listPrinters({ search, status: status || undefined, limit: 200 }) });
  const printers = printersQuery.data?.items ?? [];
  const filtered = useMemo(() => printers, [printers]);

  return (
    <div>
      <PageHeader title="Impressoras" description="Gestão centralizada de impressoras coletadas pelos agentes." actions={<Button variant="secondary" disabled={!filtered.length} onClick={() => downloadCsv('impressoras.csv', filtered.map((printer) => ({ name: printer.name, driver: printer.driver ?? '', port: printer.port ?? '', status: printer.status ?? '', agent: printer.agent_hostname ?? printer.agent_id })))}>Exportar CSV</Button>} />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, driver, porta ou agente" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Todos os status</option>
            <option value="ready">Ready</option>
            <option value="unknown">Unknown</option>
            <option value="error">Error</option>
          </select>
          <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); }}>Limpar filtros</Button>
        </div>
      </Card>
      {printersQuery.isLoading && <LoadingState />}
      {printersQuery.error && <ErrorState error={printersQuery.error} />}
      {!printersQuery.isLoading && !printersQuery.error && filtered.length === 0 && <EmptyState title="Nenhuma impressora encontrada" />}
      {filtered.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/80"><tr><th className="px-4 py-3 text-left">Nome</th><th className="px-4 py-3 text-left">Driver</th><th className="px-4 py-3 text-left">Porta</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Agente</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((printer) => (<tr key={printer.id}><td className="px-4 py-3 font-medium">{printer.name}</td><td className="px-4 py-3">{printer.driver ?? '-'}</td><td className="px-4 py-3">{printer.port ?? '-'}</td><td className="px-4 py-3">{printer.type ?? (printer.is_default ? 'Padrão' : 'Local')}</td><td className="px-4 py-3"><Badge tone={statusTone(printer.status)}>{printer.status ?? 'unknown'}</Badge></td><td className="px-4 py-3">{printer.agent_hostname ?? printer.agent_id}</td></tr>))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
