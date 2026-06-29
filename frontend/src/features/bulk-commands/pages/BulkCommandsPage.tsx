import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBulkCommands } from '../hooks/useBulkCommands';
import type {
  BulkAgent,
  BulkCommandPayload,
  BulkCommandType,
  BulkCommandResult,
} from '../api/bulkCommandsApi';

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getAgentName(agent: BulkAgent) {
  return agent.hostname || agent.name || agent.id;
}

function matchesSearch(agent: BulkAgent, search: string) {
  const normalized = search.trim().toLowerCase();

  if (!normalized) return true;

  const content = [
    agent.id,
    agent.hostname,
    agent.name,
    agent.status,
    agent.agent_version,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return content.includes(normalized);
}

function getCommandLabel(command: BulkCommandType) {
  const labels: Record<BulkCommandType, string> = {
    collect_diagnostics: 'Coletar diagnóstico',
    restart_spooler: 'Reiniciar spooler',
    clear_print_queue: 'Limpar fila de impressão',
    update_agent: 'Atualizar agente',
  };

  return labels[command];
}

function statusBadge(status?: string | null) {
  const normalized = String(status || '').toLowerCase();

  if (normalized.includes('online')) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Online
      </span>
    );
  }

  if (normalized.includes('offline')) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        Offline
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      {valueOrDash(status)}
    </span>
  );
}


function resultStatusBadge(result: BulkCommandResult) {
  const status = String(result.status || '').toLowerCase();

  if (!result.ok && status === 'failed') {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        Falhou
      </span>
    );
  }

  if (status === 'success') {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Sucesso
      </span>
    );
  }

  if (['failed', 'timed_out', 'error', 'cancelled', 'canceled'].includes(status)) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        {status === 'timed_out' ? 'Expirado' : 'Falhou'}
      </span>
    );
  }

  if (['running', 'processing', 'in_progress'].includes(status)) {
    return (
      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
        Executando
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      Aguardando
    </span>
  );
}

export function BulkCommandsPage() {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [commandType, setCommandType] = useState<BulkCommandType>('collect_diagnostics');

  const [packageUrl, setPackageUrl] = useState('');
  const [version, setVersion] = useState('0.1.2');
  const [sha256, setSha256] = useState('');

  const [localMessage, setLocalMessage] = useState('');

  const {
    agents,
    isLoadingAgents,
    agentsError,
    refetchAgents,
    sendBulkCommand,
    isSendingBulkCommand,
    bulkResults,
    bulkError,
    resetBulkResults,
    isPollingBulkResults,
  } = useBulkCommands();

  const filteredAgents = useMemo(
    () => agents.filter((agent) => matchesSearch(agent, search)),
    [agents, search]
  );

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedIds.includes(agent.id)),
    [agents, selectedIds]
  );

  const allFilteredSelected =
    filteredAgents.length > 0 &&
    filteredAgents.every((agent) => selectedIds.includes(agent.id));

  function toggleAgent(agentId: string) {
    setSelectedIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredAgents.map((agent) => agent.id));
      setSelectedIds((current) => current.filter((id) => !filteredIds.has(id)));
      return;
    }

    const next = new Set(selectedIds);

    for (const agent of filteredAgents) {
      next.add(agent.id);
    }

    setSelectedIds([...next]);
  }

  function buildPayload(): BulkCommandPayload | null {
    if (commandType === 'update_agent') {
      if (!packageUrl.trim()) {
        setLocalMessage('Informe a URL do pacote ZIP para atualizar o agente.');
        return null;
      }

      return {
        command_type: commandType,
        payload: {
          package_url: packageUrl.trim(),
          version: version.trim() || undefined,
          sha256: sha256.trim() || undefined,
          task_name: 'Gabriel Windows Agent',
        },
      };
    }

    return {
      command_type: commandType,
      payload: {},
    };
  }

  async function handleSendCommand() {
    setLocalMessage('');
    resetBulkResults();

    if (selectedAgents.length === 0) {
      setLocalMessage('Selecione pelo menos um agente.');
      return;
    }

    const command = buildPayload();

    if (!command) return;

    await sendBulkCommand({
      agents: selectedAgents,
      command,
    });

    setLocalMessage(
      `Comando "${getCommandLabel(commandType)}" enviado para ${selectedAgents.length} agente(s). Acompanhando execução...`
    );
  }

  const successCount = bulkResults.filter((item) => item.status === 'success').length;
  const failedCount = bulkResults.filter((item) =>
    ['failed', 'timed_out', 'error', 'cancelled', 'canceled'].includes(String(item.status || '').toLowerCase())
  ).length;
  const pendingCount = Math.max(bulkResults.length - successCount - failedCount, 0);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Comandos em massa
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Selecione vários agentes e envie ações de suporte para todos de uma vez.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetchAgents()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Atualizar lista
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Comando
            </label>
            <select
              value={commandType}
              onChange={(event) => setCommandType(event.target.value as BulkCommandType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="collect_diagnostics">Coletar diagnóstico</option>
              <option value="restart_spooler">Reiniciar spooler</option>
              <option value="clear_print_queue">Limpar fila de impressão</option>
              <option value="update_agent">Atualizar agente</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Agentes selecionados
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {selectedAgents.length} agente(s) selecionado(s)
            </div>
          </div>
        </div>

        {commandType === 'update_agent' ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                URL do pacote ZIP
              </label>
              <input
                type="url"
                value={packageUrl}
                onChange={(event) => setPackageUrl(event.target.value)}
                placeholder="https://.../gabriel-windows-agent.zip"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Versão
              </label>
              <input
                type="text"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="0.1.2"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                SHA256 opcional
              </label>
              <input
                type="text"
                value={sha256}
                onChange={(event) => setSha256(event.target.value)}
                placeholder="Deixe vazio no teste"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            Comando selecionado: <span className="font-medium text-slate-700">{getCommandLabel(commandType)}</span>
          </div>

          <button
            type="button"
            onClick={handleSendCommand}
            disabled={isSendingBulkCommand || isPollingBulkResults || selectedAgents.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingBulkCommand ? 'Enviando...' : isPollingBulkResults ? 'Acompanhando...' : 'Enviar comando em massa'}
          </button>
        </div>

        {localMessage ? (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            {localMessage}
          </div>
        ) : null}

        {bulkError ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Erro ao enviar comandos em massa.
          </div>
        ) : null}
      </div>

      {bulkResults.length > 0 ? (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Acompanhamento da execução
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Sucesso: {successCount} · Aguardando: {pendingCount} · Falha: {failedCount}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Agente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Command ID</th>
                  <th className="px-4 py-3">Erro</th>
                </tr>
              </thead>

              <tbody>
                {bulkResults.map((result) => (
                  <tr key={result.agent_id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {result.agent_name}
                    </td>

                    <td className="px-4 py-3">{resultStatusBadge(result)}</td>

                    <td className="px-4 py-3 text-slate-700">
                      {valueOrDash(result.command_id)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {valueOrDash(result.error)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Agentes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Exibindo {filteredAgents.length} de {agents.length} agente(s).
              </p>
            </div>

            <div className="w-full lg:max-w-md">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Buscar agente
              </label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hostname, status, versão..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        {agentsError ? (
          <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Erro ao carregar agentes.
          </div>
        ) : null}

        {isLoadingAgents ? (
          <div className="p-5 text-sm text-slate-500">
            Carregando agentes...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum agente encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-12 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-5 py-3">Agente</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Versão</th>
                  <th className="px-5 py-3">Último check-in</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(agent.id)}
                        onChange={() => toggleAgent(agent.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">
                        {getAgentName(agent)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {agent.id}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {statusBadge(agent.status)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {valueOrDash(agent.agent_version)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {formatDate(agent.last_seen)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/agents/${agent.id}`}
                        className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white hover:shadow-sm"
                      >
                        Abrir agente
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
