import { Badge } from '../../../components/ui/Badge';
import type { Printer } from '../types';

function getPrinterStatus(printer: Printer) {
  if (printer.is_online === true) {
    return 'online';
  }

  if (printer.is_online === false) {
    return 'offline';
  }

  return String(printer.status || 'unknown').toLowerCase();
}

export function PrinterStatusBadge({ printer }: { printer: Printer }) {
  const status = getPrinterStatus(printer);

  if (['online', 'ready', 'ok'].includes(status)) {
    return <Badge variant="success">Online</Badge>;
  }

  if (['offline', 'disabled'].includes(status)) {
    return <Badge variant="danger">Offline</Badge>;
  }

  if (['warning', 'paused', 'busy'].includes(status)) {
    return <Badge variant="warning">Atenção</Badge>;
  }

  if (['error', 'failed'].includes(status)) {
    return <Badge variant="danger">Erro</Badge>;
  }

  return <Badge variant="default">Desconhecido</Badge>;
}
