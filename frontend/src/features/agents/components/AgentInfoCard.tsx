import { Card } from '../../../components/ui/Card';
import type { Agent } from '../types';
import { AgentStatusBadge } from './AgentStatusBadge';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-slate-800">
        {value || '-'}
      </p>
    </div>
  );
}

export function AgentInfoCard({ agent }: { agent: Agent }) {
  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            {agent.hostname || 'Agente sem hostname'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            ID: {agent.id}
          </p>
        </div>

        <AgentStatusBadge agent={agent} />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <InfoItem label="Sistema operacional" value={agent.os_version} />
        <InfoItem label="Versão do agente" value={agent.agent_version} />
        <InfoItem label="IP" value={agent.last_ip || agent.internal_ip || agent.external_ip} />
        <InfoItem label="MAC Address" value={agent.mac_address} />
        <InfoItem label="Último check-in" value={formatDate(agent.last_seen_at)} />
        <InfoItem label="Status bruto" value={agent.status || agent.enrollment_status} />
        <InfoItem label="Tenant ID" value={agent.tenant_id} />
        <InfoItem label="Group ID" value={agent.group_id} />
        <InfoItem label="Criado em" value={formatDate(agent.created_at)} />
        <InfoItem label="Atualizado em" value={formatDate(agent.updated_at)} />
        <InfoItem label="Revogado em" value={formatDate(agent.revoked_at)} />
      </div>
    </Card>
  );
}
