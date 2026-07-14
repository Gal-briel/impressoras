export type OperationalAlertType =
  | 'command_failed'
  | 'agent_offline'
  | 'security_alert'
  | 'software_change';

export const operationalAlertTypeLabels: Record<OperationalAlertType, string> = {
  command_failed: 'Falha em comando',
  agent_offline: 'Agente offline',
  security_alert: 'Segurança',
  software_change: 'Mudança de software',
};

export const statusOptions = [
  { value: 'active', label: 'Ativos' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'ignored', label: 'Ignorados' },
  { value: 'all', label: 'Todos' },
];

export const severityOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'Crítico' },
  { value: 'warning', label: 'Atenção' },
  { value: 'info', label: 'Info' },
];

export const alertTypeOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'command_failed', label: operationalAlertTypeLabels.command_failed },
  { value: 'agent_offline', label: operationalAlertTypeLabels.agent_offline },
  { value: 'security_alert', label: operationalAlertTypeLabels.security_alert },
  { value: 'software_change', label: operationalAlertTypeLabels.software_change },
];

export function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function severityLabel(severity: string) {
  if (severity === 'critical') {
    return 'Crítico';
  }

  if (severity === 'warning') {
    return 'Atenção';
  }

  if (severity === 'info') {
    return 'Info';
  }

  return severity;
}

export function severityBadgeClass(severity: string) {
  if (severity === 'critical') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (severity === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export function statusLabel(status: string) {
  if (status === 'active') {
    return 'Ativo';
  }

  if (status === 'resolved') {
    return 'Resolvido';
  }

  if (status === 'ignored') {
    return 'Ignorado';
  }

  return status;
}

export function statusBadgeClass(status: string) {
  if (status === 'active') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (status === 'resolved') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function alertTypeLabel(alertType: string) {
  return operationalAlertTypeLabels[alertType as OperationalAlertType] || alertType;
}
