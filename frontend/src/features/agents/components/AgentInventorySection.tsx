import { useParams } from 'react-router-dom';
import { useAgentInventory } from '../hooks/useAgentInventory';
import type { AgentInventory } from '../api/agentInventoryApi';

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (!error) return null;

  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (error as any).response;
    return response?.data?.detail || response?.data?.message || 'Erro ao atualizar inventário.';
  }

  if (error instanceof Error) return error.message;

  return 'Erro ao atualizar inventário.';
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-900">
        {valueOrDash(value)}
      </div>
    </div>
  );
}

function SmallTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows?: Array<Record<string, any>>;
  columns: Array<{ key: string; label: string }>;
}) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (safeRows.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              {columns.map((column) => (
                <th key={column.key} className="py-2 pr-3">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {safeRows.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="py-2 pr-3 text-slate-700">
                    {valueOrDash(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryDetails({ inventory }: { inventory: AgentInventory }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoItem label="Fabricante" value={inventory.manufacturer} />
        <InfoItem label="Modelo" value={inventory.model} />
        <InfoItem label="Serial / Service Tag" value={inventory.serial_number} />
        <InfoItem label="Hostname" value={inventory.hostname} />

        <InfoItem label="Domínio" value={inventory.domain_name} />
        <InfoItem label="Usuário" value={inventory.logged_user} />
        <InfoItem label="IP principal" value={inventory.primary_ip} />
        <InfoItem label="Arquitetura" value={inventory.architecture} />

        <InfoItem label="Sistema operacional" value={inventory.os_name} />
        <InfoItem label="Versão / build" value={inventory.os_build || inventory.os_version} />
        <InfoItem label="Memória RAM" value={inventory.ram_total_gb ? `${inventory.ram_total_gb} GB` : null} />
        <InfoItem label="Última coleta" value={formatDate(inventory.collected_at)} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoItem label="Processador" value={inventory.processor_name} />
        <InfoItem label="Cores" value={inventory.cpu_cores} />
        <InfoItem label="Threads" value={inventory.cpu_threads} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoItem label="TPM presente" value={inventory.tpm_present} />
        <InfoItem label="TPM pronto" value={inventory.tpm_ready} />
        <InfoItem label="Secure Boot" value={inventory.secure_boot_enabled} />
      </div>

      <SmallTable
        title="Discos"
        rows={inventory.disks}
        columns={[
          { key: 'friendly_name', label: 'Nome' },
          { key: 'model', label: 'Modelo' },
          { key: 'media_type', label: 'Tipo' },
          { key: 'bus_type', label: 'Barramento' },
          { key: 'size_gb', label: 'GB' },
          { key: 'health_status', label: 'Saúde' },
          { key: 'serial_number', label: 'Serial' },
        ]}
      />

      <SmallTable
        title="Memórias físicas"
        rows={inventory.memory_modules}
        columns={[
          { key: 'device_locator', label: 'Slot' },
          { key: 'manufacturer', label: 'Fabricante' },
          { key: 'capacity_gb', label: 'GB' },
          { key: 'speed_mhz', label: 'MHz' },
          { key: 'part_number', label: 'Part number' },
          { key: 'serial_number', label: 'Serial' },
        ]}
      />

      <SmallTable
        title="Rede"
        rows={inventory.network_adapters}
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'interface_description', label: 'Descrição' },
          { key: 'status', label: 'Status' },
          { key: 'mac_address', label: 'MAC' },
          { key: 'link_speed', label: 'Velocidade' },
          { key: 'ipv4', label: 'IPv4' },
        ]}
      />
    </div>
  );
}

export function AgentInventorySection() {
  const params = useParams<{ id?: string; agentId?: string }>();
  const agentId = params.agentId || params.id;

  const {
    inventory,
    isLoading,
    refreshInventory,
    isRefreshingInventory,
    refreshError,
  } = useAgentInventory(agentId);

  async function handleRefreshInventory() {
    await refreshInventory();
  }

  const errorMessage = getErrorMessage(refreshError);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Inventário patrimonial
          </h2>
          <p className="text-sm text-slate-500">
            Dados persistentes da máquina para controle de parque e suporte.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshInventory}
          disabled={isRefreshingInventory}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshingInventory ? 'Atualizando...' : 'Atualizar inventário patrimonial'}
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-slate-500">Carregando inventário patrimonial...</div>
      ) : !inventory ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Nenhum inventário patrimonial salvo ainda. Execute um diagnóstico remoto e depois clique em atualizar o inventário patrimonial.
        </div>
      ) : (
        <InventoryDetails inventory={inventory} />
      )}
    </div>
  );
}
