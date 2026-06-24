import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogs } from '../../api/auditApi';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDateTime } from '../../utils/date';
import { downloadCsv } from '../../utils/exportCsv';

export function AuditPage() {
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const auditQuery = useQuery({ queryKey: ['audit', { action, user }], queryFn: () => listAuditLogs({ action: action || undefined, user: user || undefined, limit: 200 }) });
  const logs = auditQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Auditoria" description="Rastreabilidade de ações do usuário, comandos e alterações administrativas." actions={<Button variant="secondary" disabled={!logs.length} onClick={() => downloadCsv('auditoria.csv', logs.map((log) => ({ action: log.action, user: log.user_email ?? log.user_id ?? '', target: `${log.target_type}:${log.target_id}`, date: log.created_at })))}>Exportar CSV</Button>} />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-3">
          <input value={user} onChange={(event) => setUser(event.target.value)} placeholder="Usuário/e-mail" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Ação" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <Button variant="secondary" onClick={() => { setUser(''); setAction(''); }}>Limpar filtros</Button>
        </div>
      </Card>
      {auditQuery.isLoading && <LoadingState />}
      {auditQuery.error && <ErrorState error={auditQuery.error} />}
      {!auditQuery.isLoading && !auditQuery.error && logs.length === 0 && <EmptyState title="Nenhum registro de auditoria" />}
      <div className="space-y-3">
        {logs.map((log) => (
          <Card key={log.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="font-semibold">{log.action}</p><p className="text-sm text-slate-500">{log.user_email ?? log.user_id} • {log.target_type}:{log.target_id}</p></div>
              <p className="text-xs text-slate-500">{formatDateTime(log.created_at)}</p>
            </div>
            {log.metadata_payload && <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(log.metadata_payload, null, 2)}</pre>}
          </Card>
        ))}
      </div>
    </div>
  );
}
