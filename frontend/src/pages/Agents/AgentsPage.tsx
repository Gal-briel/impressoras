import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAgentGroup, createAgentTag, listAgentGroups, listAgents, listAgentTags, revokeAgent } from '../../api/agentApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { downloadCsv } from '../../utils/exportCsv';
import { formatDateTime, relativeFromNow } from '../../utils/date';

export function AgentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const agentsQuery = useQuery({ queryKey: ['agents', { search, status }], queryFn: () => listAgents({ search, status: status || undefined, limit: 100 }) });
  const tagsQuery = useQuery({ queryKey: ['agent-tags'], queryFn: listAgentTags });
  const groupsQuery = useQuery({ queryKey: ['agent-groups'], queryFn: listAgentGroups });
  const [tagName, setTagName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  const createTagMutation = useMutation({
    mutationFn: createAgentTag,
    onSuccess: () => {
      setTagName('');
      void queryClient.invalidateQueries({ queryKey: ['agent-tags'] });
    },
  });
  const createGroupMutation = useMutation({
    mutationFn: createAgentGroup,
    onSuccess: () => {
      setGroupName('');
      setGroupDescription('');
      void queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: ({ agentId, reason }: { agentId: string; reason: string }) => revokeAgent(agentId, reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const agents = agentsQuery.data?.items ?? [];
  const filtered = useMemo(() => agents, [agents]);

  function handleExport() {
    downloadCsv('agentes.csv', filtered.map((agent) => ({
      hostname: agent.hostname,
      status: agent.calculated_status ?? '',
      enrollment_status: agent.enrollment_status ?? '',
      version: agent.agent_version ?? '',
      ip: agent.last_ip ?? '',
      last_seen: agent.last_seen ?? '',
    })));
  }

  return (
    <div>
      <PageHeader
        title="Gestão de agentes"
        description="Localize agentes, consulte status, tags, grupos e execute ações de segurança."
        actions={<Button variant="secondary" onClick={handleExport} disabled={!filtered.length}>Exportar CSV</Button>}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="grid gap-3 md:grid-cols-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar hostname, IP ou versão" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="">Todos os status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="unknown">Unknown</option>
            </select>
            <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); }}>Limpar filtros</Button>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold">Classificação</p>
          <p className="mt-2 text-xs text-slate-500">Tags: {tagsQuery.data?.total ?? 0} • Grupos: {groupsQuery.data?.total ?? 0}</p>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Criar tag</h2>
          <div className="flex gap-2">
            <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="Ex.: Financeiro" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <Button onClick={() => createTagMutation.mutate(tagName)} disabled={!tagName || createTagMutation.isPending}>Criar</Button>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Criar grupo</h2>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex.: Matriz" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Descrição" className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <Button onClick={() => createGroupMutation.mutate({ name: groupName, description: groupDescription })} disabled={!groupName || createGroupMutation.isPending}>Criar</Button>
          </div>
        </Card>
      </div>

      {agentsQuery.isLoading && <LoadingState />}
      {agentsQuery.error && <ErrorState error={agentsQuery.error} />}
      {!agentsQuery.isLoading && !agentsQuery.error && filtered.length === 0 && <EmptyState title="Nenhum agente encontrado" description="Ajuste os filtros ou aguarde o enrollment/check-in dos agentes." />}
      {filtered.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/80">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Hostname</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Versão</th>
                  <th className="px-4 py-3 text-left font-semibold">Último Check-In</th>
                  <th className="px-4 py-3 text-left font-semibold">IP</th>
                  <th className="px-4 py-3 text-left font-semibold">Tags</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-4 py-3"><Link to={`/agents/${agent.id}`} className="font-medium text-brand-600 hover:underline">{agent.hostname}</Link></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(agent.enrollment_status === 'revoked' ? 'revoked' : agent.calculated_status)}>{agent.enrollment_status === 'revoked' ? 'revoked' : agent.calculated_status ?? 'unknown'}</Badge></td>
                    <td className="px-4 py-3">{agent.agent_version ?? '-'}</td>
                    <td className="px-4 py-3"><span title={formatDateTime(agent.last_seen)}>{relativeFromNow(agent.last_seen)}</span></td>
                    <td className="px-4 py-3">{agent.last_ip ?? '-'}</td>
                    <td className="px-4 py-3">{agent.tags?.map((tag) => tag.name).join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        disabled={agent.enrollment_status === 'revoked' || revokeMutation.isPending}
                        onClick={() => {
                          const reason = window.prompt('Motivo da revogação', 'Revogado pelo painel');
                          if (reason) revokeMutation.mutate({ agentId: agent.id, reason });
                        }}
                      >Revogar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
