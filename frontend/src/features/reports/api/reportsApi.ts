import { api } from '../../../api/httpClient';

export type ReportPeriodParams = {
  days?: number;
};

export type OverviewMetrics = {
  total: number;
  active?: number;
  resolved?: number;
  ignored?: number;
  active_critical?: number;
  active_warning?: number;
  active_info?: number;
  unread?: number;
  read?: number;
  archived?: number;
  unread_critical?: number;
  unread_warning?: number;
  success?: number;
  failed?: number;
  timed_out?: number;
  pending?: number;
  running?: number;
  inactive?: number;
  critical?: number;
  warning?: number;
  info?: number;
  added?: number;
  removed?: number;
  changed?: number;
  users?: number;
  actions?: number;
};

export type ReportsOverviewResponse = {
  days: number;
  operational_alerts: OverviewMetrics;
  notifications: OverviewMetrics;
  commands: OverviewMetrics;
  security_alerts: OverviewMetrics;
  software_changes: OverviewMetrics;
  audit: OverviewMetrics;
};

export type OperationalAlertReportByType = {
  alert_type: string;
  severity: string;
  status: string;
  total: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
};

export type OperationalAlertReportByAgent = {
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  last_seen?: string | null;
  total: number;
  active: number;
  resolved: number;
  ignored: number;
  active_critical: number;
  active_warning: number;
  active_info: number;
  last_alert_at?: string | null;
};

export type OperationalAlertReportRecent = {
  id: string;
  agent_id?: string | null;
  hostname?: string | null;
  alert_type: string;
  severity: string;
  status: string;
  title: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;
  ignored_at?: string | null;
};

export type OperationalAlertsReportResponse = {
  days: number;
  by_type: OperationalAlertReportByType[];
  by_agent: OperationalAlertReportByAgent[];
  recent: OperationalAlertReportRecent[];
};

export type CommandsReportByTypeStatus = {
  command_type: string;
  status: string;
  total: number;
  first_created_at?: string | null;
  last_created_at?: string | null;
};

export type CommandsReportByAgent = {
  agent_id: string;
  hostname?: string | null;
  agent_version?: string | null;
  total: number;
  success: number;
  failed: number;
  timed_out: number;
  last_command_at?: string | null;
};

export type CommandsReportRecent = {
  id: string;
  agent_id: string;
  hostname?: string | null;
  user_email?: string | null;
  command_type: string;
  status: string;
  error_code?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type CommandsReportResponse = {
  days: number;
  by_type_status: CommandsReportByTypeStatus[];
  by_agent: CommandsReportByAgent[];
  recent: CommandsReportRecent[];
};

export type AuditReportByAction = {
  action: string;
  target_type: string;
  total: number;
  last_seen_at?: string | null;
};

export type AuditReportByUser = {
  user_id: string;
  user_email?: string | null;
  total: number;
  distinct_actions: number;
  last_activity_at?: string | null;
};

export type AuditReportRecent = {
  id: string;
  user_id: string;
  user_email?: string | null;
  action: string;
  target_type: string;
  target_id: string;
  ip_address?: string | null;
  created_at?: string | null;
};

export type AuditActivityReportResponse = {
  days: number;
  by_action: AuditReportByAction[];
  by_user: AuditReportByUser[];
  recent: AuditReportRecent[];
};

export async function getReportsOverview(params?: ReportPeriodParams) {
  const { data } = await api.get<ReportsOverviewResponse>('/reports/overview', {
    params,
  });

  return data;
}

export async function getOperationalAlertsReport(params?: ReportPeriodParams) {
  const { data } = await api.get<OperationalAlertsReportResponse>(
    '/reports/operational-alerts',
    {
      params,
    },
  );

  return data;
}

export async function getCommandsReport(params?: ReportPeriodParams) {
  const { data } = await api.get<CommandsReportResponse>('/reports/commands', {
    params,
  });

  return data;
}

export async function getAuditActivityReport(params?: ReportPeriodParams) {
  const { data } = await api.get<AuditActivityReportResponse>(
    '/reports/audit-activity',
    {
      params,
    },
  );

  return data;
}
