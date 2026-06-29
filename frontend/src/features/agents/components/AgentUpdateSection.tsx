import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAgentUpdate } from '../hooks/useAgentUpdate';

function normalizeErrorMessage(value: unknown): string {
  if (!value) return 'Erro ao enviar atualização.';

  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) return String((item as any).msg);
        return JSON.stringify(item);
      })
      .join(' | ');
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return 'Erro ao enviar atualização.';
    }
  }

  return String(value);
}

function getErrorMessage(error: unknown) {
  if (!error) return null;

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as any).response;
    const detail = response?.data?.detail || response?.data?.message || response?.data;
    return normalizeErrorMessage(detail);
  }

  if (error instanceof Error) return error.message;

  return normalizeErrorMessage(error);
}

export function AgentUpdateSection() {
  const params = useParams<{ id?: string; agentId?: string }>();
  const agentId = params.agentId || params.id;

  const [packageUrl, setPackageUrl] = useState('');
  const [sha256, setSha256] = useState('');
  const [version, setVersion] = useState('0.1.1');
  const [successMessage, setSuccessMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const {
    updateAgent,
    isUpdatingAgent,
    updateAgentError,
  } = useAgentUpdate(agentId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setSuccessMessage('');
    setLocalError('');

    if (!agentId) {
      setLocalError('ID do agente não encontrado na rota.');
      return;
    }

    if (!packageUrl.trim()) {
      setLocalError('Informe a URL do pacote ZIP.');
      return;
    }

    try {
      const requestedVersion = version.trim() || undefined;

      await updateAgent({
        package_url: packageUrl.trim(),
        sha256: sha256.trim() || undefined,
        version: requestedVersion,
        task_name: 'Gabriel Windows Agent',
      });

      setSuccessMessage(
        `Comando de atualização enviado para a versão ${requestedVersion || 'não informada'}. O agente deve baixar o pacote e reiniciar em alguns segundos.`
      );
    } catch (error) {
      setLocalError(getErrorMessage(error) || 'Erro ao enviar atualização.');
    }
  }

  const errorMessage = localError || getErrorMessage(updateAgentError);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Atualização do agente
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Envie uma nova versão do pacote ZIP para o agente baixar, aplicar e reiniciar.
        </p>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <p className="mt-1 text-xs text-slate-500">
            A URL precisa estar acessível pela máquina Windows. Para teste, deixe o SHA256 vazio.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Versão nova
            </label>
            <input
              type="text"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="0.1.1"
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
              placeholder="Deixe vazio no primeiro teste"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isUpdatingAgent || !packageUrl.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUpdatingAgent ? 'Enviando atualização...' : 'Atualizar agente'}
        </button>
      </form>
    </div>
  );
}
