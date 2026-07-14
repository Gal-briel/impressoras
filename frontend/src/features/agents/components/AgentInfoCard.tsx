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

function groupingStatusLabel(agent: Agent) {
  if (agent.grouping_status === 'manual') {
    return 'Classificação manual';
  }

  if (agent.grouping_status === 'auto') {
    return 'Classificação automática por domínio';
  }

  if (agent.grouping_status === 'requires_review') {
    return 'Revisar empresa/grupo';
  }

  return agent.grouping_status || '-';
}

export function AgentInfoCard({ agent }: { agent: Agent }) {
  const requiresReview = agent.grouping_status === 'requires_review';

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

      {requiresReview ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-800">
            Este agente não possui domínio detectado.
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Ele foi colocado automaticamente no grupo “Sem domínio”. Revise e mova para a empresa/grupo correto.
          </p>
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Empresa / Grupo
        </p>

        <p className="mt-2 text-lg font-bold text-slate-950">
          {agent.group_name || 'Sem grupo'}
        </p>

        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <InfoItem label="Domínio detectado" value={agent.domain_name || 'Sem domínio'} />
          <InfoItem label="Origem do agrupamento" value={agent.grouping_source} />
          <InfoItem label="Status do agrupamento" value={groupingStatusLabel(agent)} />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <InfoItem label="Sistema operacional" value={agent.os_version} />
        <InfoItem label="Versão do agente" value={agent.agent_version} />
        <InfoItem label="IP" value={agent.last_ip || agent.internal_ip || agent.external_ip} />
        <InfoItem label="MAC Address" value={agent.mac_address} />
        <InfoItem label="Último check-in" value={formatDate(agent.last_seen || agent.last_seen_at)} />
        <InfoItem label="Status" value={agent.status || agent.enrollment_status} />
        <InfoItem label="Tenant ID" value={agent.tenant_id} />
        <InfoItem label="Group ID" value={agent.group_id} />
        <InfoItem label="Criado em" value={formatDate(agent.created_at)} />
        <InfoItem label="Atualizado em" value={formatDate(agent.updated_at)} />
        <InfoItem label="Revogado em" value={formatDate(agent.revoked_at)} />
      </div>
    </Card>
  );
}
