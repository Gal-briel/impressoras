import { Badge } from '../../../components/ui/Badge';
import type { AgentEvent } from '../types';

function getSeverity(event: AgentEvent) {
  return String(event.severity || event.level || 'info').toLowerCase();
}

export function EventSeverityBadge({ event }: { event: AgentEvent }) {
  const severity = getSeverity(event);

  if (['debug'].includes(severity)) {
    return <Badge variant="default">Debug</Badge>;
  }

  if (['info', 'notice'].includes(severity)) {
    return <Badge variant="info">Info</Badge>;
  }

  if (['warning', 'warn'].includes(severity)) {
    return <Badge variant="warning">Aviso</Badge>;
  }

  if (['error', 'failed', 'failure'].includes(severity)) {
    return <Badge variant="danger">Erro</Badge>;
  }

  if (['critical', 'fatal'].includes(severity)) {
    return <Badge variant="danger">Crítico</Badge>;
  }

  return <Badge variant="default">{severity}</Badge>;
}
