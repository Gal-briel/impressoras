import { Badge } from '../../../components/ui/Badge';
import type { Agent } from '../types';

function normalizeStatus(agent: Agent): string {
  const rawStatus = String(agent.calculated_status || agent.status || agent.enrollment_status || '').toLowerCase();

  if (agent.revoked_at || rawStatus.includes('revoked')) {
    return 'revoked';
  }

  if (rawStatus.includes('approved')) {
    return 'approved';
  }

  if (rawStatus.includes('pending')) {
    return 'pending';
  }

  if (rawStatus.includes('online')) {
    return 'online';
  }

  if (rawStatus.includes('offline')) {
    return 'offline';
  }

  return rawStatus || 'unknown';
}

export function getAgentDisplayStatus(agent: Agent): string {
  return normalizeStatus(agent);
}

export function AgentStatusBadge({ agent }: { agent: Agent }) {
  const status = normalizeStatus(agent);

  if (status === 'online') {
    return <Badge variant="success">Online</Badge>;
  }

  if (status === 'approved') {
    return <Badge variant="success">Aprovado</Badge>;
  }

  if (status === 'pending') {
    return <Badge variant="warning">Pendente</Badge>;
  }

  if (status === 'revoked') {
    return <Badge variant="danger">Revogado</Badge>;
  }

  if (status === 'offline') {
    return <Badge variant="default">Offline</Badge>;
  }

  return <Badge variant="info">{status}</Badge>;
}
