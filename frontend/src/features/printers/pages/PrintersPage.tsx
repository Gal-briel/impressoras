import { useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useAgents } from '../../agents/hooks/useAgents';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import { usePrinters } from '../hooks/usePrinters';
import type { Printer } from '../types';
import { PrinterStatusBadge } from '../components/PrinterStatusBadge';

type LooseAgent = {
  id: string;
  hostname?: string | null;
  name?: string | null;
  internal_ip?: string | null;
  last_ip?: string | null;
  ip?: string | null;
  status?: string | null;
  approval_status?: string | null;
  revoked_at?: string | null;
  agent_network?: string | null;
  network?: string | null;
  group_name?: string | null;
  agent_group_name?: string | null;
  domain_name?: string | null;
  agent_domain_name?: string | null;
};

type InstallSelection = {
  printer: Printer;
  sourceNetwork: string;
  sourceCompanyKey: string;
} | null;

type InstallMethod = 'tcp_ip' | 'smb_share';
type NetworkPrinterProtocol = 'tcp_9100' | 'lpr_515';

type InstallForm = {
  targetAgentId: string;
  printerName: string;
  installMethod: InstallMethod;
  sharePath: string;
  ip: string;
  protocol: NetworkPrinterProtocol;
  port: string;
  driverName: string;
  queueName: string;
};

function getPrinterName(printer: Printer) {
  return printer.name || printer.printer_name || 'Impressora sem nome';
}

function getAgentName(agent?: LooseAgent | null) {
  return agent?.hostname || agent?.name || agent?.id || 'Agente sem nome';
}

function getAgentIp(agent?: LooseAgent | null) {
  return agent?.internal_ip || agent?.last_ip || agent?.ip || null;
}

function networkFromIp(ipValue?: string | null) {
  if (!ipValue) return null;

  const parts = String(ipValue).trim().split('.').map((item) => Number(item));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function getAgentNetwork(agent?: LooseAgent | null) {
  return agent?.agent_network || agent?.network || networkFromIp(getAgentIp(agent));
}

function getPrinterNetwork(printer: Printer, sourceAgent?: LooseAgent | null) {
  return printer.agent_network || printer.network || getAgentNetwork(sourceAgent) || 'Rede não identificada';
}

function getAgentCompanyName(agent?: LooseAgent | null) {
  return (
    agent?.agent_group_name ||
    agent?.group_name ||
    agent?.agent_domain_name ||
    agent?.domain_name ||
    'Sem empresa/grupo'
  );
}

function getPrinterCompanyName(printer: Printer, sourceAgent?: LooseAgent | null) {
  return (
    printer.agent_group_name ||
    printer.company_group ||
    printer.agent_domain_name ||
    getAgentCompanyName(sourceAgent)
  );
}

function getCompanyKey(name: string) {
  return name.trim().toLowerCase();
}

function getPrinterCompanyKey(printer: Printer, sourceAgent?: LooseAgent | null) {
  return getCompanyKey(getPrinterCompanyName(printer, sourceAgent));
}

function extractIp(value?: string | null) {
  if (!value) return '';

  const match = String(value).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match?.[1] || '';
}

function getSuggestedPrinterIp(printer: Printer) {
  return extractIp(printer.port_name) || extractIp(printer.share_name) || '';
}

function getSuggestedProtocol(printer: Printer): NetworkPrinterProtocol {
  const port = String(printer.port_name || '').toLowerCase();

  if (port.includes('lpr') || port.includes('515')) {
    return 'lpr_515';
  }

  return 'tcp_9100';
}

function defaultPortForProtocol(protocol: NetworkPrinterProtocol) {
  return protocol === 'lpr_515' ? '515' : '9100';
}

function getInitialInstallForm(printer: Printer): InstallForm {
  const protocol = getSuggestedProtocol(printer);
  const shareName = String(printer.share_name || '');

  return {
    targetAgentId: '',
    printerName: getPrinterName(printer),
    installMethod: shareName.startsWith('\\\\') ? 'smb_share' : 'tcp_ip',
    sharePath: shareName.startsWith('\\\\') ? shareName : '',
    ip: getSuggestedPrinterIp(printer),
    protocol,
    port: defaultPortForProtocol(protocol),
    driverName: printer.driver_name || '',
    queueName: '',
  };
}

function isVirtualPrinter(printer: Printer) {
  const name = getPrinterName(printer).toLowerCase();
  const driver = String(printer.driver_name || '').toLowerCase();
  const port = String(printer.port_name || '').toLowerCase();

  return (
    name.includes('onenote') ||
    name.includes('print to pdf') ||
    name.includes('pdf') ||
    driver.includes('onenote') ||
    driver.includes('pdf') ||
    port.includes('nul') ||
    port.includes('portprompt')
  );
}

function isAgentOnline(agent?: LooseAgent | null) {
  return String(agent?.status || '').toLowerCase() === 'online';
}

function isAgentApproved(agent?: LooseAgent | null) {
  const approval = String(agent?.approval_status || 'approved').toLowerCase();
  return !agent?.revoked_at && !['revoked', 'blocked', 'rejected'].includes(approval);
}

function canPrepareInstall(printer: Printer) {
  if (isVirtualPrinter(printer)) return false;
  return Boolean(printer.share_name || printer.port_name || printer.is_network || printer.is_shared);
}

function isExpanded(map: Record<string, boolean>, key: string) {
  return map[key] ?? true;
}

export function PrintersPage() {
  const [search, setSearch] = useState('');
  const [installSelection, setInstallSelection] = useState<InstallSelection>(null);
  const [installForm, setInstallForm] = useState<InstallForm | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [installError, setInstallError] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({});
  const [expandedNetworks, setExpandedNetworks] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, error, refetch, isFetching } = usePrinters();
  const agentsQuery = useAgents();
  const createCommandMutation = useCreateCommand();

  const printers = data?.items || [];
  const agents = (agentsQuery.data?.items || []) as LooseAgent[];

  const agentsById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent]));
  }, [agents]);

  const filteredPrinters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return printers;

    return printers.filter((printer) => {
      const sourceAgent = agentsById.get(printer.agent_id || '');
      const fields = [
        getPrinterName(printer),
        printer.driver_name,
        printer.port_name,
        printer.share_name,
        printer.agent_hostname,
        sourceAgent?.hostname,
        sourceAgent?.internal_ip,
        getPrinterNetwork(printer, sourceAgent),
        getPrinterCompanyName(printer, sourceAgent),
      ];

      return fields.some((field) => String(field || '').toLowerCase().includes(normalizedSearch));
    });
  }, [agentsById, printers, search]);

  const groupedByCompany = useMemo(() => {
    const companyMap = new Map<
      string,
      {
        key: string;
        name: string;
        printers: Printer[];
        networks: Map<string, Printer[]>;
      }
    >();

    for (const printer of filteredPrinters) {
      const sourceAgent = agentsById.get(printer.agent_id || '');
      const companyName = getPrinterCompanyName(printer, sourceAgent);
      const companyKey = getCompanyKey(companyName);
      const network = getPrinterNetwork(printer, sourceAgent);

      if (!companyMap.has(companyKey)) {
        companyMap.set(companyKey, {
          key: companyKey,
          name: companyName,
          printers: [],
          networks: new Map(),
        });
      }

      const company = companyMap.get(companyKey)!;
      company.printers.push(printer);

      if (!company.networks.has(network)) {
        company.networks.set(network, []);
      }

      company.networks.get(network)?.push(printer);
    }

    return Array.from(companyMap.values())
      .map((company) => ({
        ...company,
        networks: Array.from(company.networks.entries())
          .map(([network, items]) => ({
            network,
            key: `${company.key}:${network}`,
            items,
            agents: agents.filter((agent) => {
              return getCompanyKey(getAgentCompanyName(agent)) === company.key && getAgentNetwork(agent) === network;
            }),
          }))
          .sort((a, b) => a.network.localeCompare(b.network)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, agentsById, filteredPrinters]);

  const sharedCount = printers.filter((printer) => printer.is_shared).length;
  const defaultCount = printers.filter((printer) => printer.is_default).length;
  const networkCount = groupedByCompany.reduce((total, company) => total + company.networks.length, 0);

  const selectedPrinter = installSelection?.printer || null;
  const selectedSourceAgent = selectedPrinter ? agentsById.get(selectedPrinter.agent_id || '') : null;

  const targetAgents = useMemo(() => {
    if (!installSelection) return [];

    return agents.filter((agent) => {
      const sameNetwork = getAgentNetwork(agent) === installSelection.sourceNetwork;
      const sameCompany = getCompanyKey(getAgentCompanyName(agent)) === installSelection.sourceCompanyKey;
      const notSource = agent.id !== installSelection.printer.agent_id;

      return sameNetwork && sameCompany && notSource && isAgentOnline(agent) && isAgentApproved(agent);
    });
  }, [agents, installSelection]);

  function toggleCompany(companyKey: string) {
    setExpandedCompanies((current) => ({
      ...current,
      [companyKey]: !isExpanded(current, companyKey),
    }));
  }

  function toggleNetwork(networkKey: string) {
    setExpandedNetworks((current) => ({
      ...current,
      [networkKey]: !isExpanded(current, networkKey),
    }));
  }

  function openInstallModal(printer: Printer, sourceNetwork: string, sourceCompanyKey: string) {
    setInstallSelection({ printer, sourceNetwork, sourceCompanyKey });
    setInstallForm(getInitialInstallForm(printer));
    setInstallMessage('');
    setInstallError('');
  }

  function closeInstallModal() {
    setInstallSelection(null);
    setInstallForm(null);
    setInstallMessage('');
    setInstallError('');
  }

  function updateInstallForm(partial: Partial<InstallForm>) {
    setInstallForm((current) => (current ? { ...current, ...partial } : current));
  }

  function handleProtocolChange(protocol: NetworkPrinterProtocol) {
    updateInstallForm({
      protocol,
      port: defaultPortForProtocol(protocol),
    });
  }

  async function handleInstallPrinter() {
    if (!installSelection || !installForm) return;

    setInstallMessage('');
    setInstallError('');

    if (!installForm.targetAgentId) {
      setInstallError('Selecione o computador de destino.');
      return;
    }

    if (!installForm.printerName.trim()) {
      setInstallError('Informe o nome da impressora no Windows.');
      return;
    }

    if (installForm.installMethod === 'smb_share' && !installForm.sharePath.trim()) {
      setInstallError('Informe o caminho compartilhado da impressora.');
      return;
    }

    if (installForm.installMethod === 'tcp_ip' && !installForm.ip.trim()) {
      setInstallError('Informe o IP da impressora.');
      return;
    }

    const parsedPort = Number(installForm.port || defaultPortForProtocol(installForm.protocol));

    const payload: Record<string, unknown> = {
      source: 'printers_page',
      source_agent_id: installSelection.printer.agent_id,
      source_agent_hostname: installSelection.printer.agent_hostname,
      source_network: installSelection.sourceNetwork,
      source_company_key: installSelection.sourceCompanyKey,
      printer_id: installSelection.printer.id,
      printer_name: installForm.printerName.trim(),
      install_method: installForm.installMethod,
      driver_name: installForm.driverName.trim() || null,
      timeout_seconds: 180,
    };

    if (installForm.installMethod === 'smb_share') {
      payload.share_path = installForm.sharePath.trim();
    } else {
      payload.ip = installForm.ip.trim();
      payload.protocol = installForm.protocol;
      payload.port = Number.isFinite(parsedPort)
        ? parsedPort
        : Number(defaultPortForProtocol(installForm.protocol));
      payload.port_name = installSelection.printer.port_name || null;

      if (installForm.protocol === 'lpr_515') {
        payload.queue_name = installForm.queueName.trim() || null;
      }
    }

    const targetAgent = agentsById.get(installForm.targetAgentId);

    await createCommandMutation.mutateAsync({
      agent_id: installForm.targetAgentId,
      command_type: 'install_network_printer',
      payload,
      timeout_seconds: 180,
    });

    setInstallMessage(`Comando de instalação enviado para ${getAgentName(targetAgent)}.`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Impressoras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Impressoras sincronizadas por empresa/grupo/domínio e separadas por rede.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {isFetching ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{printers.length}</p>
          <p className="mt-1 text-sm text-slate-500">Impressoras inventariadas</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Redes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{networkCount}</p>
          <p className="mt-1 text-sm text-slate-500">Agrupamentos por rede</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Compartilhadas</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{sharedCount}</p>
          <p className="mt-1 text-sm text-slate-500">Com compartilhamento</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Padrão</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{defaultCount}</p>
          <p className="mt-1 text-sm text-slate-500">Definidas como padrão</p>
        </Card>
      </div>

      <Card className="mb-6 p-5">
        <label className="text-sm font-semibold text-slate-700" htmlFor="printer-search">
          Buscar impressora
        </label>
        <input
          id="printer-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nome, driver, porta, empresa, domínio, rede, IP ou agente"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </Card>

      {isError && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar as impressoras.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="h-24 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : groupedByCompany.length === 0 ? (
        <Card className="border-blue-200 bg-blue-50 p-5">
          <Badge variant="info">Sem impressoras</Badge>
          <p className="mt-2 text-sm text-blue-800">
            Nenhuma impressora foi encontrada com os filtros atuais.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            Exibindo <strong>{filteredPrinters.length}</strong> de <strong>{printers.length}</strong> impressoras em <strong>{groupedByCompany.length}</strong> grupo(s).
          </p>

          {groupedByCompany.map((company) => {
            const companyExpanded = isExpanded(expandedCompanies, company.key);
            const companyAgents = agents.filter((agent) => getCompanyKey(getAgentCompanyName(agent)) === company.key);

            return (
              <Card key={company.key} className="overflow-hidden p-0">
                <div className="border-b border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">{company.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {companyAgents.length} agente(s) · {company.networks.length} rede(s) · {company.printers.length} impressora(s)
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                        Online: {companyAgents.filter(isAgentOnline).length}
                      </span>
                      <button
                        onClick={() => toggleCompany(company.key)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-slate-50"
                      >
                        {companyExpanded ? 'Recolher grupo' : 'Expandir grupo'}
                      </button>
                    </div>
                  </div>
                </div>

                {companyExpanded && (
                  <div className="space-y-4 bg-slate-50 p-5">
                    {company.networks.map((group) => {
                      const networkExpanded = isExpanded(expandedNetworks, group.key);

                      return (
                        <Card key={group.key} className="overflow-hidden p-0">
                          <div className="border-b border-slate-200 bg-slate-50 p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h3 className="text-lg font-bold text-slate-950">
                                  Rede {group.network}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  {group.agents.length} agente(s) nesta rede · {group.items.length} impressora(s)
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                                  Online: {group.agents.filter(isAgentOnline).length}
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                                  Instaláveis: {group.items.filter(canPrepareInstall).length}
                                </span>
                                <button
                                  onClick={() => toggleNetwork(group.key)}
                                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-slate-50"
                                >
                                  {networkExpanded ? 'Recolher rede' : 'Expandir rede'}
                                </button>
                              </div>
                            </div>
                          </div>

                          {networkExpanded && (
                            <div className="divide-y divide-slate-200 bg-white">
                              {group.items.map((printer) => {
                                const sourceAgent = agentsById.get(printer.agent_id || '');
                                const sourceNetwork = getPrinterNetwork(printer, sourceAgent);
                                const sourceCompanyKey = getPrinterCompanyKey(printer, sourceAgent);
                                const installable = canPrepareInstall(printer);

                                return (
                                  <div key={printer.id} className="p-5">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h4 className="text-base font-bold text-slate-950">
                                            {getPrinterName(printer)}
                                          </h4>

                                          <PrinterStatusBadge printer={printer} />

                                          {printer.is_default && <Badge variant="info">Padrão</Badge>}
                                          {printer.is_shared && <Badge variant="success">Compartilhada</Badge>}
                                          {printer.is_network && <Badge variant="info">Rede</Badge>}
                                          {isVirtualPrinter(printer) && <Badge variant="warning">Virtual</Badge>}
                                        </div>

                                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                                          <div>
                                            <span className="font-semibold text-slate-700">Agente:</span>{' '}
                                            {printer.agent_hostname || getAgentName(sourceAgent)}
                                          </div>
                                          <div>
                                            <span className="font-semibold text-slate-700">IP agente:</span>{' '}
                                            {printer.agent_ip || getAgentIp(sourceAgent) || '—'}
                                          </div>
                                          <div>
                                            <span className="font-semibold text-slate-700">Driver:</span>{' '}
                                            {printer.driver_name || '—'}
                                          </div>
                                          <div>
                                            <span className="font-semibold text-slate-700">Porta:</span>{' '}
                                            {printer.port_name || '—'}
                                          </div>
                                        </div>

                                        {printer.share_name && (
                                          <p className="mt-2 text-sm text-slate-600">
                                            <span className="font-semibold text-slate-700">Compartilhamento:</span>{' '}
                                            {printer.share_name}
                                          </p>
                                        )}

                                        {!installable && (
                                          <p className="mt-3 text-xs text-amber-700">
                                            Impressoras virtuais ou sem porta/compartilhamento não serão replicadas.
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex shrink-0 flex-wrap gap-2">
                                        <button
                                          disabled={!installable}
                                          onClick={() => openInstallModal(printer, sourceNetwork, sourceCompanyKey)}
                                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                        >
                                          Instalar em um computador
                                        </button>

                                        {printer.agent_id && (
                                          <a
                                            href={`/agents/${printer.agent_id}`}
                                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                          >
                                            Ver agente
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {installSelection && selectedPrinter && installForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-6">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Instalar em um computador
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Apenas computadores online, aprovados, da mesma empresa/grupo e da mesma rede são exibidos.
                </p>
              </div>

              <button
                onClick={closeInstallModal}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Impressora de origem</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{getPrinterName(selectedPrinter)}</p>
              <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <p><span className="font-semibold text-slate-700">Empresa/grupo:</span> {getPrinterCompanyName(selectedPrinter, selectedSourceAgent)}</p>
                <p><span className="font-semibold text-slate-700">Rede:</span> {installSelection.sourceNetwork}</p>
                <p><span className="font-semibold text-slate-700">Origem:</span> {selectedPrinter.agent_hostname || getAgentName(selectedSourceAgent)}</p>
                <p><span className="font-semibold text-slate-700">Driver origem:</span> {selectedPrinter.driver_name || '—'}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Computador de destino
                </h3>

                {targetAgents.length === 0 ? (
                  <Card className="mt-3 border-amber-200 bg-amber-50 p-4">
                    <Badge variant="warning">Nenhum destino disponível</Badge>
                    <p className="mt-2 text-sm text-amber-700">
                      Não há outro agente online, aprovado, na mesma empresa/grupo e na mesma rede.
                    </p>
                  </Card>
                ) : (
                  <div className="mt-3 space-y-3">
                    {targetAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => updateInstallForm({ targetAgentId: agent.id })}
                        className={`w-full rounded-lg border p-4 text-left transition ${
                          installForm.targetAgentId === agent.id
                            ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="font-semibold text-slate-950">{getAgentName(agent)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          IP: {getAgentIp(agent) || '—'} · Rede: {getAgentNetwork(agent) || '—'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Dados de instalação
                </h3>

                <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Nome no Windows</span>
                    <input
                      value={installForm.printerName}
                      onChange={(event) => updateInstallForm({ printerName: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Método</span>
                    <select
                      value={installForm.installMethod}
                      onChange={(event) => updateInstallForm({ installMethod: event.target.value as InstallMethod })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="tcp_ip">TCP/IP ou LPR</option>
                      <option value="smb_share">Compartilhamento SMB</option>
                    </select>
                  </label>

                  {installForm.installMethod === 'smb_share' ? (
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">Caminho compartilhado</span>
                      <input
                        value={installForm.sharePath}
                        onChange={(event) => updateInstallForm({ sharePath: event.target.value })}
                        placeholder="\\SERVIDOR\IMPRESSORA"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">IP da impressora</span>
                          <input
                            value={installForm.ip}
                            onChange={(event) => updateInstallForm({ ip: event.target.value })}
                            placeholder="10.34.10.230"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Protocolo</span>
                          <select
                            value={installForm.protocol}
                            onChange={(event) => handleProtocolChange(event.target.value as NetworkPrinterProtocol)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="tcp_9100">TCP/IP 9100</option>
                            <option value="lpr_515">LPR 515</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Porta</span>
                          <input
                            value={installForm.port}
                            onChange={(event) => updateInstallForm({ port: event.target.value })}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Driver</span>
                          <input
                            value={installForm.driverName}
                            onChange={(event) => updateInstallForm({ driverName: event.target.value })}
                            placeholder="Ex: EPSON L355 Series"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      {installForm.protocol === 'lpr_515' && (
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Fila LPR</span>
                          <input
                            value={installForm.queueName}
                            onChange={(event) => updateInstallForm({ queueName: event.target.value })}
                            placeholder="Ex: print, lp, queue"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                      )}
                    </>
                  )}

                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Deixe o driver vazio para o agente retornar a lista de drivers disponíveis no destino.
                    Para LPR/515, a fila LPR é obrigatória.
                  </div>
                </div>
              </div>
            </div>

            {installError && (
              <Card className="mt-5 border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">{installError}</p>
              </Card>
            )}

            {createCommandMutation.isError && (
              <Card className="mt-5 border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">
                  Não foi possível enviar o comando.
                </p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
                  {createCommandMutation.error instanceof Error
                    ? createCommandMutation.error.message
                    : 'Erro desconhecido'}
                </pre>
              </Card>
            )}

            {installMessage && (
              <Card className="mt-5 border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{installMessage}</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Acompanhe o resultado na aba Comandos do agente de destino.
                </p>
              </Card>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                onClick={closeInstallModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                onClick={handleInstallPrinter}
                disabled={createCommandMutation.isPending || targetAgents.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {createCommandMutation.isPending ? 'Enviando...' : 'Enviar instalação'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
