import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Card } from '../../../components/ui/Card';
import { useAgentCommands } from '../../commands/hooks/useAgentCommands';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import type { Command } from '../../commands/types';
import { createCommandIdempotencyKey } from '../../commands/utils/idempotency';
import {
  useLatestPersistedSecuritySnapshot,
  usePersistedSoftwareInventory,
  usePersistedSoftwareSources,
} from '../hooks/usePersistedInventory';

type AgentSecurityInventorySectionProps = {
  agentId: string;
};

type SoftwareSourceFilter =
  | 'all'
  | 'machine_registry'
  | 'user_registry'
  | 'package_provider'
  | 'appx_store';

function buildIdempotencyKey(commandType: string, agentId?: string) {
  return createCommandIdempotencyKey(commandType, agentId, 'security-inventory');
}

function getCommandType(command: Command) {
  return command.command_type || command.type || '';
}

function parseCommandOutput(command?: Command | null): any | null {
  if (!command?.output) return null;

  try {
    return JSON.parse(command.output);
  } catch {
    return null;
  }
}

function findLatestCommand(commands: Command[], commandType: string) {
  return [...commands]
    .filter((command) => getCommandType(command) === commandType)
    .sort((a, b) => {
      const dateA = new Date(a.created_at || '').getTime() || 0;
      const dateB = new Date(b.created_at || '').getTime() || 0;

      return dateB - dateA;
    })[0];
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function boolLabel(value: unknown) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value === null || value === undefined || value === '') return '—';

  return String(value);
}

function statusPill(value: unknown) {
  const text = boolLabel(value);
  const normalized = String(value).toLowerCase();

  const isOk =
    value === true ||
    normalized === 'on' ||
    normalized === 'enabled' ||
    normalized === 'true';

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
        isOk
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-50 text-slate-700 ring-slate-200'
      }`}
    >
      {text}
    </span>
  );
}

function commandStatusLabel(status?: string) {
  if (!status) return '—';

  const labels: Record<string, string> = {
    queued: 'Na fila',
    pending: 'Pendente',
    dispatched: 'Despachado',
    acknowledged: 'Recebido',
    executing: 'Executando',
    success: 'Sucesso',
    failed: 'Falhou',
    timed_out: 'Expirou',
    timeout: 'Expirou',
    expired: 'Expirado',
  };

  return labels[status] || status;
}

function commandStatusClass(status?: string) {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';

  if (status === 'failed' || status === 'timed_out' || status === 'timeout' || status === 'expired') {
    return 'bg-red-50 text-red-700 ring-red-200';
  }

  if (status === 'executing' || status === 'dispatched' || status === 'acknowledged') {
    return 'bg-blue-50 text-blue-700 ring-blue-200';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200';
}

function CommandMiniStatus({ command }: { command?: Command | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span
        className={`inline-flex rounded-full px-2 py-1 font-semibold ring-1 ${commandStatusClass(command?.status)}`}
      >
        {commandStatusLabel(command?.status)}
      </span>
      <span>{formatDateTime(command?.finished_at || command?.created_at)}</span>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro desconhecido.';
  }
}

function sourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    all: 'Todos',
    machine_registry: 'Registro da máquina',
    user_registry: 'Registro do usuário',
    package_provider: 'Package Provider',
    appx_store: 'Microsoft Store/Appx',
  };

  return labels[String(source || '')] || source || '—';
}

function sourcePill(source?: string | null) {
  const normalized = String(source || '');

  const className =
    normalized === 'machine_registry'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : normalized === 'user_registry'
        ? 'bg-violet-50 text-violet-700 ring-violet-200'
        : normalized === 'package_provider'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : normalized === 'appx_store'
            ? 'bg-amber-50 text-amber-700 ring-amber-200'
            : 'bg-slate-50 text-slate-700 ring-slate-200';

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${className}`}>
      {sourceLabel(source)}
    </span>
  );
}


type SecurityAlertSeverity = 'critical' | 'warning' | 'info';

type SecurityAlert = {
  severity: SecurityAlertSeverity;
  title: string;
  description: string;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isEnabledValue(value: unknown) {
  const normalized = normalizeText(value);

  return value === true || normalized === 'true' || normalized === 'enabled' || normalized === 'on';
}

function isProtectedBitLocker(value: unknown) {
  const normalized = normalizeText(value);

  return normalized === 'on' || normalized === '1' || normalized === 'true' || normalized === 'enabled';
}

function parseDateLoose(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function daysSince(date: Date) {
  const diff = Date.now() - date.getTime();

  return Math.floor(diff / 86400000);
}

function buildSecurityAlerts(securityInventory: any): SecurityAlert[] {
  if (!securityInventory) {
    return [
      {
        severity: 'info',
        title: 'Inventário de segurança ainda não coletado',
        description: 'Execute a coleta de segurança para gerar os alertas automáticos.',
      },
    ];
  }

  const alerts: SecurityAlert[] = [];

  const defender = securityInventory.defender || {};
  const antivirusItems = Array.isArray(securityInventory.antivirus)
    ? securityInventory.antivirus
    : [];

  if (defender.available === false) {
    alerts.push({
      severity: 'critical',
      title: 'Microsoft Defender indisponível',
      description: 'O comando não conseguiu consultar o status do Defender nesta máquina.',
    });
  }

  if (antivirusItems.length === 0) {
    alerts.push({
      severity: 'critical',
      title: 'Nenhum antivírus detectado',
      description: 'Nenhum produto foi retornado pelo Windows Security Center.',
    });
  }

  if (defender.available === true && defender.antivirus_enabled === false) {
    alerts.push({
      severity: 'critical',
      title: 'Antivírus do Defender desativado',
      description: 'O Microsoft Defender está disponível, mas o antivírus está desligado.',
    });
  }

  if (defender.available === true && defender.real_time_protection_enabled === false) {
    alerts.push({
      severity: 'critical',
      title: 'Proteção em tempo real desativada',
      description: 'A proteção em tempo real do Defender está desligada.',
    });
  }

  const firewallProfiles = Array.isArray(securityInventory.firewall)
    ? securityInventory.firewall
    : [];

  const disabledFirewallProfiles = firewallProfiles.filter((profile: any) => !isEnabledValue(profile.enabled));

  if (disabledFirewallProfiles.length) {
    alerts.push({
      severity: 'warning',
      title: 'Perfil de firewall desativado',
      description: `Perfis afetados: ${disabledFirewallProfiles.map((profile: any) => profile.name).join(', ')}.`,
    });
  }

  const bitlockerVolumes = Array.isArray(securityInventory.bitlocker)
    ? securityInventory.bitlocker
    : [];

  const unprotectedVolumes = bitlockerVolumes.filter((volume: any) => {
    const mountPoint = normalizeText(volume.mount_point);
    const isSystemDrive = mountPoint === 'c:' || mountPoint === 'c:\\';

    return isSystemDrive && !isProtectedBitLocker(volume.protection_status);
  });

  if (unprotectedVolumes.length) {
    alerts.push({
      severity: 'warning',
      title: 'BitLocker desprotegido no disco do sistema',
      description: 'O volume C: não aparece com proteção ativa do BitLocker.',
    });
  }

  const localUsers = Array.isArray(securityInventory.local_users)
    ? securityInventory.local_users
    : [];

  const enabledBuiltInAdmins = localUsers.filter((user: any) => {
    const name = normalizeText(user.name);

    return user.enabled === true && ['administrator', 'administrador'].includes(name);
  });

  if (enabledBuiltInAdmins.length) {
    alerts.push({
      severity: 'warning',
      title: 'Administrador local padrão habilitado',
      description: 'A conta Administrador/Administrator está habilitada. Revise se isso é necessário.',
    });
  }

  const localAdministrators = Array.isArray(securityInventory.local_administrators)
    ? securityInventory.local_administrators
    : [];

  if (localAdministrators.length) {
    alerts.push({
      severity: 'info',
      title: 'Administradores locais encontrados',
      description: `${localAdministrators.length} membro(s) no grupo Administrators. Revise se todos são autorizados.`,
    });
  }

  const hotfixes = Array.isArray(securityInventory.hotfixes)
    ? securityInventory.hotfixes
    : [];

  if (!hotfixes.length) {
    alerts.push({
      severity: 'warning',
      title: 'Nenhum hotfix encontrado',
      description: 'A coleta não retornou atualizações instaladas pelo Get-HotFix.',
    });
  } else {
    const newestHotfixDate = hotfixes
      .map((item: any) => parseDateLoose(item.installed_on))
      .filter(Boolean)
      .sort((a: any, b: any) => b.getTime() - a.getTime())[0];

    if (newestHotfixDate) {
      const age = daysSince(newestHotfixDate);

      if (age > 45) {
        alerts.push({
          severity: 'warning',
          title: 'Último hotfix antigo',
          description: `O hotfix mais recente encontrado tem aproximadamente ${age} dia(s).`,
        });
      }
    }
  }

  if (!alerts.length) {
    alerts.push({
      severity: 'info',
      title: 'Nenhum alerta crítico encontrado',
      description: 'Os principais indicadores de segurança coletados não apresentaram problema evidente.',
    });
  }

  return alerts;
}

function alertSeverityLabel(severity: SecurityAlertSeverity) {
  const labels: Record<SecurityAlertSeverity, string> = {
    critical: 'Crítico',
    warning: 'Atenção',
    info: 'Info',
  };

  return labels[severity];
}

function alertSeverityClass(severity: SecurityAlertSeverity) {
  const classes: Record<SecurityAlertSeverity, string> = {
    critical: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  };

  return classes[severity];
}

function alertBadgeClass(severity: SecurityAlertSeverity) {
  const classes: Record<SecurityAlertSeverity, string> = {
    critical: 'bg-red-100 text-red-800 ring-red-200',
    warning: 'bg-amber-100 text-amber-900 ring-amber-200',
    info: 'bg-blue-100 text-blue-800 ring-blue-200',
  };

  return classes[severity];
}


function calculateSecurityScore(alerts: SecurityAlert[], hasInventory: boolean) {
  if (!hasInventory) {
    return null;
  }

  let score = 100;

  for (const alert of alerts) {
    if (alert.severity === 'critical') score -= 30;
    if (alert.severity === 'warning') score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

function securityScoreLabel(score: number | null) {
  if (score === null) return 'Aguardando coleta';
  if (score >= 85) return 'Bom';
  if (score >= 60) return 'Atenção';
  return 'Crítico';
}

function securityScoreClass(score: number | null) {
  if (score === null) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (score >= 85) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function buildSecurityRecommendations(alerts: SecurityAlert[]) {
  const recommendations: string[] = [];

  for (const alert of alerts) {
    const title = alert.title.toLowerCase();

    if (title.includes('firewall')) {
      recommendations.push('Ativar os perfis de Firewall do Windows ou validar se a política corporativa justifica o estado atual.');
    }

    if (title.includes('bitlocker')) {
      recommendations.push('Ativar ou revisar a proteção BitLocker no disco do sistema, principalmente no volume C:.');
    }

    if (title.includes('defender') || title.includes('antivírus') || title.includes('tempo real')) {
      recommendations.push('Validar o Microsoft Defender/antivírus e garantir proteção em tempo real ativa.');
    }

    if (title.includes('administrador local')) {
      recommendations.push('Revisar contas administrativas locais e manter apenas usuários autorizados.');
    }

    if (title.includes('hotfix')) {
      recommendations.push('Validar Windows Update e aplicar atualizações pendentes.');
    }
  }

  return Array.from(new Set(recommendations)).slice(0, 5);
}



export function AgentSecurityInventorySection({ agentId }: AgentSecurityInventorySectionProps) {
  const queryClient = useQueryClient();
  const createCommandMutation = useCreateCommand();

  const {
    data: commandsData,
    refetch: refetchCommands,
    isFetching: isFetchingCommands,
  } = useAgentCommands(agentId);

  const [softwareLimit, setSoftwareLimit] = useState(300);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [includeStoreApps, setIncludeStoreApps] = useState(false);
  const [includePackageProvider, setIncludePackageProvider] = useState(false);
  const [softwareSourceFilter, setSoftwareSourceFilter] = useState<SoftwareSourceFilter>('all');
  const [softwareOffset, setSoftwareOffset] = useState(0);
  const persistedSoftwareLimit = 50;
  const [hotfixLimit, setHotfixLimit] = useState(30);
  const [securitySoftwareLimit, setSecuritySoftwareLimit] = useState(30);
  const [includeUsb, setIncludeUsb] = useState(false);
  const [includeMonitors, setIncludeMonitors] = useState(false);
  const [includeLocalGroups, setIncludeLocalGroups] = useState(false);
  const [includeRecentSoftware, setIncludeRecentSoftware] = useState(false);

  const [successMessage, setSuccessMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const invalidatePersistedInventoryQueries = () => {
    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'persisted-software-sources'],
    });

    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'persisted-software-inventory'],
    });

    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'persisted-security-snapshot-latest'],
    });

    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'persisted-security-snapshots'],
    });

    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'latest-security-alerts'],
    });

    queryClient.invalidateQueries({
      queryKey: ['agents', agentId, 'latest-security-snapshot-comparison'],
    });
  };

  const commands = commandsData?.items || [];

  const persistedSoftwareSourcesQuery = usePersistedSoftwareSources(agentId);

  const persistedSoftwareQuery = usePersistedSoftwareInventory({
    agentId,
    source: softwareSourceFilter,
    search: softwareSearch,
    limit: persistedSoftwareLimit,
    offset: softwareOffset,
  });

  const persistedSecurityQuery = useLatestPersistedSecuritySnapshot(agentId);

  const latestInventoryFinishedKey = commands
    .filter((command) =>
      ['collect_software_inventory', 'collect_security_inventory'].includes(command.command_type),
    )
    .map((command) => `${command.id}:${command.status}:${command.finished_at ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!latestInventoryFinishedKey) {
      return;
    }

    const hasFinishedInventoryCommand = commands.some(
      (command) =>
        ['collect_software_inventory', 'collect_security_inventory'].includes(command.command_type) &&
        ['success', 'failed'].includes(command.status),
    );

    if (!hasFinishedInventoryCommand) {
      return;
    }

    const timeout = window.setTimeout(() => {
      invalidatePersistedInventoryQueries();
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [latestInventoryFinishedKey]);

  const latestSoftwareCommand = useMemo(
    () => findLatestCommand(commands, 'collect_software_inventory'),
    [commands],
  );

  const latestSecurityCommand = useMemo(
    () => findLatestCommand(commands, 'collect_security_inventory'),
    [commands],
  );

  const commandSoftwareInventory = parseCommandOutput(latestSoftwareCommand);
  const commandSecurityInventory = parseCommandOutput(latestSecurityCommand);

  const persistedSoftwareResponse = persistedSoftwareQuery.data;
  const persistedSoftwareSourcesResponse = persistedSoftwareSourcesQuery.data;
  const persistedSecuritySnapshot = persistedSecurityQuery.data?.snapshot || null;

  const softwareInventory = persistedSoftwareResponse
    ? {
        count: persistedSoftwareResponse.total,
        items: persistedSoftwareResponse.items,
        search: persistedSoftwareResponse.search,
        source: persistedSoftwareResponse.source,
        include_store_apps: commandSoftwareInventory?.include_store_apps,
        include_package_provider: commandSoftwareInventory?.include_package_provider,
      }
    : commandSoftwareInventory;

  const securityInventory = persistedSecuritySnapshot || commandSecurityInventory;

  const securityAlerts = useMemo(
    () => buildSecurityAlerts(securityInventory),
    [securityInventory],
  );

  const criticalAlerts = securityAlerts.filter((alert) => alert.severity === 'critical').length;
  const warningAlerts = securityAlerts.filter((alert) => alert.severity === 'warning').length;
  const infoAlerts = securityAlerts.filter((alert) => alert.severity === 'info').length;
  const securityScore = calculateSecurityScore(securityAlerts, Boolean(securityInventory));
  const securityRecommendations = buildSecurityRecommendations(securityAlerts);

  const allSoftwareItems: any[] = Array.isArray(softwareInventory?.items)
    ? softwareInventory.items
    : [];

  const usingPersistedSoftware = Boolean(persistedSoftwareResponse);

  const filteredSoftwareItems =
    usingPersistedSoftware || softwareSourceFilter === 'all'
      ? allSoftwareItems
      : allSoftwareItems.filter((item: any) => item.source === softwareSourceFilter);

  const softwareItems = usingPersistedSoftware
    ? filteredSoftwareItems
    : filteredSoftwareItems.slice(0, 50);

  const softwareTotalByFilter = usingPersistedSoftware
    ? persistedSoftwareResponse?.total ?? filteredSoftwareItems.length
    : filteredSoftwareItems.length;

  const softwareSources = persistedSoftwareSourcesResponse?.items?.length
    ? persistedSoftwareSourcesResponse.items.map((item) => ({
        source: item.source,
        count: item.total,
      }))
    : Array.isArray(commandSoftwareInventory?.sources)
      ? commandSoftwareInventory.sources
      : [];

  const antivirusItems = Array.isArray(securityInventory?.antivirus)
    ? securityInventory.antivirus
    : [];

  const bitlockerItems = Array.isArray(securityInventory?.bitlocker)
    ? securityInventory.bitlocker
    : [];

  const firewallItems = Array.isArray(securityInventory?.firewall)
    ? securityInventory.firewall
    : [];

  const hotfixItems = Array.isArray(securityInventory?.hotfixes)
    ? securityInventory.hotfixes.slice(0, 10)
    : [];

  const localUsers = Array.isArray(securityInventory?.local_users)
    ? securityInventory.local_users.slice(0, 10)
    : [];

  const localAdministrators = Array.isArray(securityInventory?.local_administrators)
    ? securityInventory.local_administrators
    : [];

  const usbDevices = Array.isArray(securityInventory?.usb_devices)
    ? securityInventory.usb_devices.slice(0, 10)
    : [];

  const monitors = Array.isArray(securityInventory?.monitors)
    ? securityInventory.monitors
    : [];

  async function refreshQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['commands'] }),
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'commands'] }),
      refetchCommands(),
    ]);

    await queryClient.refetchQueries({
      type: 'active',
    });
  }

  async function sendCommand(
    commandType: string,
    payload: Record<string, unknown>,
    timeoutSeconds = 240,
  ) {
    setSuccessMessage('');
    setLocalError('');

    try {
      await createCommandMutation.mutateAsync({
        agent_id: agentId,
        command_type: commandType,
        payload,
        idempotency_key: buildIdempotencyKey(commandType, agentId),
        timeout_seconds: timeoutSeconds,
      });

      setSuccessMessage(`Comando "${commandType}" enviado para o agente.`);

      setTimeout(() => {
        refreshQueries();
      }, 5000);
    } catch (error) {
      setLocalError(getErrorMessage(error) || 'Erro ao enviar comando.');
    }
  }

  async function handleCollectSoftware(event: FormEvent) {
    event.preventDefault();

    await sendCommand(
      'collect_software_inventory',
      {
        limit: softwareLimit,
        search: softwareSearch.trim() || undefined,
        include_store_apps: includeStoreApps,
        include_package_provider: includePackageProvider,
      },
      300,
    );
  }

  async function handleCollectSecurity(event: FormEvent) {
    event.preventDefault();

    await sendCommand(
      'collect_security_inventory',
      {
        hotfix_limit: hotfixLimit,
        software_limit: securitySoftwareLimit,
        include_usb: includeUsb,
        include_monitors: includeMonitors,
        include_local_groups: includeLocalGroups,
        include_recent_software: includeRecentSoftware,
      },
      300,
    );
  }

  const isSending = createCommandMutation.isPending;
  const errorMessage = localError || getErrorMessage(createCommandMutation.error);

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Software e segurança
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Inventário de programas instalados, antivírus, BitLocker, firewall, atualizações e usuários locais.
        </p>
      </div>

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Resultados de software e segurança</p>
          <p className="text-xs text-slate-500">
            Mostrando inventário persistido quando disponível, com fallback para o último comando.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetchCommands()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {isFetchingCommands ? 'Atualizando...' : 'Atualizar resultados'}
        </button>
      </div>

      <div className={`mb-5 rounded-xl border p-4 ${securityScoreClass(securityScore)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold opacity-80">Score de segurança</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-black">
                {securityScore === null ? '—' : securityScore}
              </span>
              <span className="pb-1 text-sm font-semibold opacity-80">
                {securityScore === null ? '' : '/100'}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              Status: {securityScoreLabel(securityScore)}
            </p>
          </div>

          <div className="max-w-3xl">
            <p className="text-sm font-bold">Recomendações principais</p>

            {securityRecommendations.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {securityRecommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm opacity-80">
                Nenhuma recomendação crítica no momento. Execute uma nova coleta de segurança para atualizar o diagnóstico.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 p-4">
        <div className="hidden flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Alertas automáticos de segurança</h3>
            <p className="mt-1 text-xs text-slate-500">
              Análise rápida baseada na última coleta de segurança.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700 ring-1 ring-red-200">
              Críticos · {criticalAlerts}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 ring-1 ring-amber-200">
              Atenção · {warningAlerts}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-200">
              Info · {infoAlerts}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {securityAlerts.slice(0, 8).map((alert) => (
            <div
              key={`${alert.severity}-${alert.title}`}
              className={`rounded-lg border p-3 ${alertSeverityClass(alert.severity)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-90">{alert.description}</p>
                </div>

                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ring-1 ${alertBadgeClass(alert.severity)}`}>
                  {alertSeverityLabel(alert.severity)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <form onSubmit={handleCollectSoftware} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Coleta de software</h3>
          <p className="mt-1 text-sm text-slate-500">
            Lista programas instalados no registro da máquina, perfis carregados e Package Provider.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Limite
              <input
                type="number"
                min={1}
                max={3000}
                value={softwareLimit}
                onChange={(event) => setSoftwareLimit(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Buscar
              <input
                type="text"
                value={softwareSearch}
                onChange={(event) => setSoftwareSearch(event.target.value)}
                placeholder="Ex.: Chrome, Office, Java..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">
              Coleta profunda de software
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Use somente quando precisar de uma visão mais completa. Pode aumentar o volume de dados e o tempo de renderização.
            </p>

            <div className="mt-3 grid gap-2">
              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includePackageProvider}
                  onChange={(event) => setIncludePackageProvider(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>
                  Incluir Package Provider. Retorna pacotes detectados pelo Windows/PowerShell.
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeStoreApps}
                  onChange={(event) => setIncludeStoreApps(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>
                  Incluir Microsoft Store/Appx. Pode retornar muitos apps internos do Windows.
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSending}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? 'Enviando...' : 'Coletar softwares'}
          </button>
        </form>

        <form onSubmit={handleCollectSecurity} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Coleta de segurança</h3>
          <p className="mt-1 text-sm text-slate-500">
            Coleta antivírus, Defender, BitLocker, firewall, updates e contas locais.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Limite de hotfixes
              <input
                type="number"
                min={1}
                max={300}
                value={hotfixLimit}
                onChange={(event) => setHotfixLimit(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Softwares recentes
              <input
                type="number"
                min={1}
                max={500}
                value={securitySoftwareLimit}
                onChange={(event) => setSecuritySoftwareLimit(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">
              Coleta detalhada de segurança
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Por padrão a coleta é leve. Marque somente o que precisar investigar.
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeUsb}
                  onChange={(event) => setIncludeUsb(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>Incluir dispositivos USB</span>
              </label>

              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeMonitors}
                  onChange={(event) => setIncludeMonitors(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>Incluir monitores</span>
              </label>

              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeLocalGroups}
                  onChange={(event) => setIncludeLocalGroups(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>Incluir grupos locais</span>
              </label>

              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeRecentSoftware}
                  onChange={(event) => setIncludeRecentSoftware(event.target.checked)}
                  className="mt-1 rounded border-amber-300"
                />
                <span>Incluir softwares recentes</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSending}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? 'Enviando...' : 'Coletar segurança'}
          </button>
        </form>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Defender</h3>
              <p className="text-xs text-slate-500">Status do Microsoft Defender.</p>
            </div>
            <CommandMiniStatus command={latestSecurityCommand} />
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Disponível</span>
              {statusPill(securityInventory?.defender?.available)}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Antivírus ativo</span>
              {statusPill(securityInventory?.defender?.antivirus_enabled)}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Tempo real</span>
              {statusPill(securityInventory?.defender?.real_time_protection_enabled)}
            </div>
            <div>
              <span className="text-slate-500">Última assinatura</span>
              <p className="mt-1 font-mono text-xs text-slate-700">
                {securityInventory?.defender?.antivirus_signature_last_updated || '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Antivírus detectados</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Produtos registrados no Security Center.
          </p>

          {antivirusItems.length ? (
            <div className="space-y-2">
              {antivirusItems.map((item: any) => (
                <div key={item.instance_guid || item.display_name} className="rounded-lg bg-slate-50 p-2">
                  <div className="font-medium text-slate-900">{item.display_name || '—'}</div>
                  <div className="text-xs text-slate-500">Estado: {item.product_state ?? '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum antivírus informado ainda.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Firewall</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Perfis de firewall do Windows.
          </p>

          {firewallItems.length ? (
            <div className="space-y-2">
              {firewallItems.map((item: any) => (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2 text-sm">
                  <span className="font-medium text-slate-800">{item.name}</span>
                  {statusPill(item.enabled)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum firewall informado ainda.</p>
          )}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Resumo de fontes de software</h3>
            <p className="mt-1 text-xs text-slate-500">
              Origem dos softwares encontrados na última coleta.
            </p>
          </div>

          <CommandMiniStatus command={latestSoftwareCommand} />
        </div>

        {softwareSources.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {softwareSources.map((item: any) => (
              <div key={item.source} className="rounded-lg bg-slate-50 p-3">
                <div>{sourcePill(item.source)}</div>
                <div className="mt-3 text-2xl font-bold text-slate-950">{item.count ?? 0}</div>
                <div className="text-xs text-slate-500">itens encontrados</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Nenhuma fonte coletada ainda.
          </p>
        )}
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Filtro por tipo de software</h3>
            <p className="mt-1 text-xs text-slate-500">
              Separe os softwares por origem da coleta.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Exibindo {softwareTotalByFilter} de {allSoftwareItems.length} itens
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            'all',
            'machine_registry',
            'user_registry',
            'package_provider',
            'appx_store',
          ] as SoftwareSourceFilter[]).map((source) => {
            const active = softwareSourceFilter === source;
            const count =
              source === 'all'
                ? allSoftwareItems.length
                : allSoftwareItems.filter((item: any) => item.source === source).length;

            return (
              <button
                key={source}
                type="button"
                onClick={() => {
                  setSoftwareSourceFilter(source);
                  setSoftwareOffset(0);
                }}
                className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 transition ${
                  active
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {sourceLabel(source)} · {count}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Softwares instalados</h3>
              <p className="mt-1 text-xs text-slate-500">
                Total coletado: {softwareInventory?.count ?? '—'} • Exibindo: {softwareTotalByFilter} • Filtro: {sourceLabel(softwareSourceFilter)} • Busca: {softwareInventory?.search ?? 'todos'} • Package Provider: {softwareInventory?.include_package_provider ? 'incluído' : 'não incluído'} • Store/Appx: {softwareInventory?.include_store_apps ? 'incluído' : 'não incluído'}
              </p>
            </div>
            <CommandMiniStatus command={latestSoftwareCommand} />
          </div>
        </div>

        {softwareItems.length ? (
          <div className="max-h-[32rem] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Software</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Versão</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fornecedor</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Origem</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Tamanho</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {softwareItems.map((item: any) => (
                  <tr key={`${item.name}-${item.version}-${item.publisher}-${item.source}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{item.name || '—'}</div>
                      <div className="max-w-md truncate text-xs text-slate-500">
                        {item.install_location || item.registry_key || '—'}
                      </div>
                      {item.user_sid ? (
                        <div className="mt-1 max-w-md truncate font-mono text-[10px] text-slate-400">
                          SID: {item.user_sid}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{item.version || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{item.publisher || '—'}</td>
                    <td className="px-3 py-2">{sourcePill(item.source)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">{item.estimated_size_mb ?? '—'} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white p-4 text-sm text-slate-500">
            Nenhum inventário de software coletado ainda.
          </div>
        )}

        {usingPersistedSoftware && softwareTotalByFilter > persistedSoftwareLimit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3 text-sm">
            <span className="text-slate-500">
              Exibindo {softwareOffset + 1} até {Math.min(softwareOffset + persistedSoftwareLimit, softwareTotalByFilter)} de {softwareTotalByFilter}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={softwareOffset === 0}
                onClick={() => setSoftwareOffset(Math.max(0, softwareOffset - persistedSoftwareLimit))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>

              <button
                type="button"
                disabled={softwareOffset + persistedSoftwareLimit >= softwareTotalByFilter}
                onClick={() => setSoftwareOffset(softwareOffset + persistedSoftwareLimit)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">BitLocker</h3>
            <p className="mt-1 text-xs text-slate-500">Volumes e status de proteção.</p>
          </div>

          {bitlockerItems.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {bitlockerItems.map((item: any) => (
                <div key={item.mount_point} className="grid gap-2 p-3 text-sm md:grid-cols-4">
                  <div className="font-semibold text-slate-900">{item.mount_point || '—'}</div>
                  <div>Status: {item.volume_status || '—'}</div>
                  <div>Proteção: {item.protection_status || '—'}</div>
                  <div>Criptografia: {item.encryption_percentage ?? '—'}%</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum dado de BitLocker coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Windows Update / Hotfixes</h3>
            <p className="mt-1 text-xs text-slate-500">Últimas atualizações instaladas.</p>
          </div>

          {hotfixItems.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {hotfixItems.map((item: any) => (
                <div key={`${item.hotfix_id}-${item.installed_on}`} className="grid gap-2 p-3 text-sm md:grid-cols-4">
                  <div className="font-semibold text-slate-900">{item.hotfix_id || '—'}</div>
                  <div>{item.description || '—'}</div>
                  <div>{item.installed_by || '—'}</div>
                  <div className="font-mono text-xs">{item.installed_on || '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum hotfix coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Usuários locais</h3>
            <p className="mt-1 text-xs text-slate-500">Contas locais encontradas.</p>
          </div>

          {localUsers.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {localUsers.map((item: any) => (
                <div key={item.sid || item.name} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{item.name || '—'}</div>
                    <div className="text-xs text-slate-500">Último logon: {item.last_logon || '—'}</div>
                  </div>
                  {statusPill(item.enabled)}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum usuário local coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Administradores locais</h3>
            <p className="mt-1 text-xs text-slate-500">Membros do grupo Administrators.</p>
          </div>

          {localAdministrators.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {localAdministrators.map((item: any) => (
                <div key={item.sid || item.name} className="grid gap-2 p-3 text-sm md:grid-cols-3">
                  <div className="font-semibold text-slate-900">{item.name || '—'}</div>
                  <div>{item.object_class || '—'}</div>
                  <div>{item.principal_source || '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum administrador local coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Dispositivos USB</h3>
            <p className="mt-1 text-xs text-slate-500">Dispositivos USB presentes.</p>
          </div>

          {usbDevices.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {usbDevices.map((item: any) => (
                <div key={item.instance_id || item.friendly_name} className="p-3 text-sm">
                  <div className="font-semibold text-slate-900">{item.friendly_name || '—'}</div>
                  <div className="text-xs text-slate-500">{item.manufacturer || '—'} • {item.status || '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum dispositivo USB coletado ainda.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Monitores</h3>
            <p className="mt-1 text-xs text-slate-500">Monitores detectados por EDID/WMI.</p>
          </div>

          {monitors.length ? (
            <div className="divide-y divide-slate-100 bg-white">
              {monitors.map((item: any) => (
                <div key={item.instance_name || item.serial_number} className="p-3 text-sm">
                  <div className="font-semibold text-slate-900">{item.user_friendly_name || 'Monitor'}</div>
                  <div className="text-xs text-slate-500">
                    Fabricante: {item.manufacturer || '—'} • Serial: {item.serial_number || '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-4 text-sm text-slate-500">
              Nenhum monitor coletado ainda.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
