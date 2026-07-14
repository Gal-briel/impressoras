import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { downloadCsv } from '../../../utils/csv';

import {
  useAuditActivityReport,
  useCommandsReport,
  useOperationalAlertsReport,
  useReportsOverview,
} from '../hooks/useReports';

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    active: 'Ativo',
    resolved: 'Resolvido',
    ignored: 'Ignorado',
    unread: 'Não lida',
    read: 'Lida',
    archived: 'Arquivada',
    success: 'Sucesso',
    completed: 'Concluído',
    failed: 'Falhou',
    timed_out: 'Expirou',
    pending: 'Pendente',
    queued: 'Na fila',
    running: 'Executando',
    in_progress: 'Em execução',
  };

  return labels[value] || value;
}

function typeLabel(value: string) {
  const labels: Record<string, string> = {
    command_failed: 'Falha em comando',
    agent_offline: 'Agente offline',
    security_alert: 'Segurança',
    software_change: 'Mudança de software',
    collect_diagnostics: 'Coletar diagnósticos',
    collect_inventory: 'Coletar inventário',
    collect_processes: 'Coletar processos',
    collect_security_inventory: 'Coletar segurança',
    collect_services: 'Coletar serviços',
    collect_software_inventory: 'Coletar softwares',
    kill_process: 'Finalizar processo',
    start_service: 'Iniciar serviço',
    update_agent: 'Atualizar agente',
    cancel_power_action: 'Cancelar ação de energia',
    command_created: 'Comando criado',
  };

  return labels[value] || value;
}

function severityLabel(value: string) {
  const labels: Record<string, string> = {
    critical: 'Crítico',
    warning: 'Atenção',
    info: 'Info',
    success: 'Sucesso',
  };

  return labels[value] || value;
}

function severityClass(value: string) {
  const classes: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
  };

  return classes[value] || 'bg-slate-100 text-slate-700';
}

function Card({
  title,
  value,
  description,
  href,
}: {
  title: string;
  value: number | string;
  description?: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
      {href ? (
        <p className="mt-3 text-sm font-semibold text-blue-700">
          Abrir detalhes →
        </p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {content}
    </div>
  );
}

function ExportButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>

        {action ? <div>{action}</div> : null}
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function ReportsPage() {
  const [days, setDays] = useState(30);

  const overviewQuery = useReportsOverview(days);
  const operationalAlertsQuery = useOperationalAlertsReport(days);
  const commandsQuery = useCommandsReport(days);
  const auditQuery = useAuditActivityReport(days);

  const isLoading = useMemo(
    () =>
      overviewQuery.isLoading ||
      operationalAlertsQuery.isLoading ||
      commandsQuery.isLoading ||
      auditQuery.isLoading,
    [
      auditQuery.isLoading,
      commandsQuery.isLoading,
      operationalAlertsQuery.isLoading,
      overviewQuery.isLoading,
    ],
  );

  const hasError =
    overviewQuery.isError ||
    operationalAlertsQuery.isError ||
    commandsQuery.isError ||
    auditQuery.isError;

  const overview = overviewQuery.data;
  const operationalAlerts = operationalAlertsQuery.data;
  const commands = commandsQuery.data;
  const audit = auditQuery.data;

  function exportOverviewCsv() {
    if (!overview) {
      return;
    }

    downloadCsv('relatorio-visao-geral.csv', [
      {
        periodo_dias: overview.days,
        alertas_operacionais_total: overview.operational_alerts.total,
        alertas_operacionais_ativos: overview.operational_alerts.active,
        alertas_operacionais_resolvidos: overview.operational_alerts.resolved,
        notificacoes_total: overview.notifications.total,
        notificacoes_nao_lidas: overview.notifications.unread,
        notificacoes_lidas: overview.notifications.read,
        comandos_total: overview.commands.total,
        comandos_sucesso: overview.commands.success,
        comandos_falha: overview.commands.failed,
        comandos_expirados: overview.commands.timed_out,
        seguranca_total: overview.security_alerts.total,
        seguranca_ativos: overview.security_alerts.active,
        mudancas_software_total: overview.software_changes.total,
        auditoria_total: overview.audit.total,
        auditoria_usuarios: overview.audit.users,
      },
    ]);
  }

  function exportOperationalAlertsCsv() {
    if (!operationalAlerts) {
      return;
    }

    downloadCsv(
      'relatorio-alertas-operacionais-por-agente.csv',
      operationalAlerts.by_agent.map((item) => ({
        agente: item.hostname || item.agent_id,
        agent_id: item.agent_id,
        versao: item.agent_version || '',
        total: item.total,
        ativos: item.active,
        resolvidos: item.resolved,
        ignorados: item.ignored,
        criticos_ativos: item.active_critical,
        alertas_warning_ativos: item.active_warning,
        infos_ativos: item.active_info,
        ultimo_alerta: item.last_alert_at || '',
      })),
    );
  }

  function exportOperationalAlertsByTypeCsv() {
    if (!operationalAlerts) {
      return;
    }

    downloadCsv(
      'relatorio-alertas-operacionais-por-tipo.csv',
      operationalAlerts.by_type.map((item) => ({
        tipo: typeLabel(item.alert_type),
        tipo_original: item.alert_type,
        severidade: severityLabel(item.severity),
        severidade_original: item.severity,
        status: statusLabel(item.status),
        status_original: item.status,
        total: item.total,
        primeiro_alerta: item.first_seen_at || '',
        ultimo_alerta: item.last_seen_at || '',
      })),
    );
  }

  function exportCommandsByAgentCsv() {
    if (!commands) {
      return;
    }

    downloadCsv(
      'relatorio-comandos-por-agente.csv',
      commands.by_agent.map((item) => ({
        agente: item.hostname || item.agent_id,
        agent_id: item.agent_id,
        versao: item.agent_version || '',
        total: item.total,
        sucesso: item.success,
        falhas: item.failed,
        expirados: item.timed_out,
        ultimo_comando: item.last_command_at || '',
      })),
    );
  }

  function exportCommandsByTypeCsv() {
    if (!commands) {
      return;
    }

    downloadCsv(
      'relatorio-comandos-por-tipo-status.csv',
      commands.by_type_status.map((item) => ({
        comando: typeLabel(item.command_type),
        comando_original: item.command_type,
        status: statusLabel(item.status),
        status_original: item.status,
        total: item.total,
        primeiro_comando: item.first_created_at || '',
        ultimo_comando: item.last_created_at || '',
      })),
    );
  }

  function exportAuditByUserCsv() {
    if (!audit) {
      return;
    }

    downloadCsv(
      'relatorio-auditoria-por-usuario.csv',
      audit.by_user.map((item) => ({
        usuario: item.user_email || item.user_id,
        user_id: item.user_id,
        total: item.total,
        acoes_distintas: item.distinct_actions,
        ultima_atividade: item.last_activity_at || '',
      })),
    );
  }

  function exportRecentAuditCsv() {
    if (!audit) {
      return;
    }

    downloadCsv(
      'relatorio-atividades-recentes.csv',
      audit.recent.map((item) => ({
        usuario: item.user_email || item.user_id,
        user_id: item.user_id,
        acao: typeLabel(item.action),
        acao_original: item.action,
        tipo_alvo: item.target_type,
        id_alvo: item.target_id,
        ip: item.ip_address || '',
        data: item.created_at || '',
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão consolidada de alertas, comandos, notificações e auditoria.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ExportButton disabled={!overview} onClick={exportOverviewCsv}>
            Exportar visão geral
          </ExportButton>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600" htmlFor="days">
              Período
            </label>
            <select
            id="days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={180}>Últimos 180 dias</option>
            <option value={365}>Últimos 365 dias</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando relatórios...
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          Não foi possível carregar um ou mais relatórios.
        </div>
      ) : null}

      {overview ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card
            title="Alertas operacionais"
            value={formatNumber(overview.operational_alerts.total)}
            description={`${formatNumber(
              overview.operational_alerts.active,
            )} ativos`}
            href="/operational-alerts"
          />
          <Card
            title="Comandos"
            value={formatNumber(overview.commands.total)}
            description={`${formatNumber(overview.commands.failed)} falhas / ${formatNumber(
              overview.commands.timed_out,
            )} expirados`}
            href="/commands"
          />
          <Card
            title="Segurança"
            value={formatNumber(overview.security_alerts.total)}
            description={`${formatNumber(
              overview.security_alerts.active,
            )} alertas ativos`}
            href="/security-alerts"
          />
          <Card
            title="Auditoria"
            value={formatNumber(overview.audit.total)}
            description={`${formatNumber(overview.audit.users)} usuário(s)`}
            href="/audit"
          />
        </div>
      ) : null}

      <Section
        title="Alertas operacionais por agente"
        description="Agentes com maior concentração de alertas no período."
        action={
          <ExportButton
            disabled={!operationalAlerts?.by_agent.length}
            onClick={exportOperationalAlertsCsv}
          >
            Exportar CSV
          </ExportButton>
        }
      >
        {operationalAlerts?.by_agent.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Agente</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Ativos</th>
                  <th className="px-3 py-2">Resolvidos</th>
                  <th className="px-3 py-2">Último alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operationalAlerts.by_agent.map((item) => (
                  <tr key={item.agent_id}>
                    <td className="px-3 py-3">
                      <Link
                        to={`/agents/${item.agent_id}`}
                        className="font-semibold text-blue-700 hover:text-blue-900"
                      >
                        {item.hostname || item.agent_id}
                      </Link>
                      <p className="text-xs text-slate-500">{item.agent_id}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          to={`/agents/${item.agent_id}`}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Ver agente
                        </Link>
                        <Link
                          to={`/operational-alerts?agent_id=${item.agent_id}`}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          Ver alertas
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {formatNumber(item.total)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatNumber(item.active)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatNumber(item.resolved)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.last_alert_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyTable message="Nenhum alerta operacional no período." />
        )}
      </Section>

      <Section
        title="Alertas por tipo"
        description="Distribuição por tipo, severidade e status."
        action={
          <ExportButton
            disabled={!operationalAlerts?.by_type.length}
            onClick={exportOperationalAlertsByTypeCsv}
          >
            Exportar CSV
          </ExportButton>
        }
      >
        {operationalAlerts?.by_type.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operationalAlerts.by_type.map((item) => (
              <Link
                key={`${item.alert_type}-${item.severity}-${item.status}`}
                to={`/operational-alerts?alert_type=${item.alert_type}&severity=${item.severity}&status=${item.status}`}
                className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {typeLabel(item.alert_type)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {statusLabel(item.status)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${severityClass(
                      item.severity,
                    )}`}
                  >
                    {severityLabel(item.severity)}
                  </span>
                </div>

                <p className="mt-4 text-2xl font-bold text-slate-900">
                  {formatNumber(item.total)}
                </p>

                <p className="mt-3 text-sm font-semibold text-blue-700">
                  Abrir alertas →
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyTable message="Nenhum agrupamento de alerta encontrado." />
        )}
      </Section>

      <Section
        title="Comandos por agente"
        description="Resumo de execuções remotas por máquina."
        action={
          <ExportButton
            disabled={!commands?.by_agent.length}
            onClick={exportCommandsByAgentCsv}
          >
            Exportar CSV
          </ExportButton>
        }
      >
        {commands?.by_agent.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Agente</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Sucesso</th>
                  <th className="px-3 py-2">Falhas</th>
                  <th className="px-3 py-2">Expirados</th>
                  <th className="px-3 py-2">Último comando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commands.by_agent.map((item) => (
                  <tr key={item.agent_id}>
                    <td className="px-3 py-3">
                      <Link
                        to={`/agents/${item.agent_id}`}
                        className="font-semibold text-blue-700 hover:text-blue-900"
                      >
                        {item.hostname || item.agent_id}
                      </Link>
                      <p className="text-xs text-slate-500">{item.agent_id}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          to={`/agents/${item.agent_id}`}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Ver agente
                        </Link>
                        <Link
                          to={`/commands?agent_id=${item.agent_id}`}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          Ver comandos
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {formatNumber(item.total)}
                    </td>
                    <td className="px-3 py-3 text-emerald-700">
                      {formatNumber(item.success)}
                    </td>
                    <td className="px-3 py-3 text-red-700">
                      {formatNumber(item.failed)}
                    </td>
                    <td className="px-3 py-3 text-amber-700">
                      {formatNumber(item.timed_out)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.last_command_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyTable message="Nenhum comando no período." />
        )}
      </Section>

      <Section
        title="Comandos por tipo e status"
        description="Agrupamento operacional dos comandos executados."
        action={
          <ExportButton
            disabled={!commands?.by_type_status.length}
            onClick={exportCommandsByTypeCsv}
          >
            Exportar CSV
          </ExportButton>
        }
      >
        {commands?.by_type_status.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {commands.by_type_status.map((item) => (
              <Link
                key={`${item.command_type}-${item.status}`}
                to={`/commands?status=${item.status}`}
                className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:shadow-md"
              >
                <p className="font-semibold text-slate-900">
                  {typeLabel(item.command_type)}
                </p>
                <p className="text-sm text-slate-500">
                  {statusLabel(item.status)}
                </p>
                <p className="mt-4 text-2xl font-bold text-slate-900">
                  {formatNumber(item.total)}
                </p>
                <p className="mt-3 text-sm font-semibold text-blue-700">
                  Abrir comandos →
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyTable message="Nenhum agrupamento de comando encontrado." />
        )}
      </Section>

      <Section
        title="Auditoria por usuário"
        description="Volume de ações auditadas no período."
        action={
          <ExportButton
            disabled={!audit?.by_user.length}
            onClick={exportAuditByUserCsv}
          >
            Exportar CSV
          </ExportButton>
        }
      >
        {audit?.by_user.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Ações</th>
                  <th className="px-3 py-2">Tipos distintos</th>
                  <th className="px-3 py-2">Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.by_user.map((item) => (
                  <tr key={item.user_id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">
                        {item.user_email || item.user_id}
                      </p>
                      <p className="text-xs text-slate-500">{item.user_id}</p>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {formatNumber(item.total)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatNumber(item.distinct_actions)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.last_activity_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyTable message="Nenhuma atividade auditada no período." />
        )}
      </Section>

      <Section
        title="Atividades recentes"
        description="Últimos registros de auditoria capturados."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/audit"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Abrir auditoria
            </Link>
            <ExportButton
              disabled={!audit?.recent.length}
              onClick={exportRecentAuditCsv}
            >
              Exportar CSV
            </ExportButton>
          </div>
        }
      >
        {audit?.recent.length ? (
          <div className="space-y-3">
            {audit.recent.slice(0, 15).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {typeLabel(item.action)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {item.user_email || item.user_id} • {item.target_type}:{' '}
                      {item.target_id}
                    </p>
                  </div>

                  <div className="text-sm text-slate-500">
                    {formatDate(item.created_at)}
                  </div>
                </div>

                {item.ip_address ? (
                  <p className="mt-2 text-xs text-slate-500">
                    IP: {item.ip_address}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyTable message="Nenhum registro recente de auditoria." />
        )}
      </Section>
    </div>
  );
}
