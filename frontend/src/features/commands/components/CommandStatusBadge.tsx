import { Badge } from '../../../components/ui/Badge';
import type { Command } from '../types';

export function getCommandDisplayStatus(command: Command): string {
  return String(command.status || 'queued').toLowerCase();
}

export function CommandStatusBadge({ command }: { command: Command }) {
  const status = getCommandDisplayStatus(command);

  if (['queued', 'pending', 'dispatched', 'acknowledged'].includes(status)) {
    return <Badge variant="warning">Pendente</Badge>;
  }

  if (status === 'executing') {
    return <Badge variant="info">Executando</Badge>;
  }

  if (status === 'success') {
    return <Badge variant="success">Sucesso</Badge>;
  }

  if (status === 'failed') {
    return <Badge variant="danger">Falhou</Badge>;
  }

  if (['timed_out', 'timeout'].includes(status)) {
    return <Badge variant="danger">Timeout</Badge>;
  }

  if (status === 'expired') {
    return <Badge variant="default">Expirado</Badge>;
  }

  return <Badge variant="default">{status}</Badge>;
}
