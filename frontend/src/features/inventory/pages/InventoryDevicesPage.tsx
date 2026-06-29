import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventoryDevices } from '../hooks/useInventoryDevices';
import type { InventoryDevice } from '../api/inventoryDevicesApi';

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusBadge(value?: boolean | null) {
  if (value === true) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Sim
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        Não
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      —
    </span>
  );
}

function getDeviceName(device: InventoryDevice) {
  return device.hostname || device.agent_hostname || 'Sem hostname';
}

function matchesSearch(device: InventoryDevice, search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) return true;

  const content = [
    device.hostname,
    device.agent_hostname,
    device.manufacturer,
    device.model,
    device.serial_number,
    device.os_name,
    device.os_version,
    device.processor_name,
    device.primary_ip,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return content.includes(normalizedSearch);
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: unknown;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">
        {valueOrDash(value)}
      </div>
      <div className="mt-2 text-sm text-slate-500">{description}</div>
    </div>
  );
}

export function InventoryDevicesPage() {
  const [search, setSearch] = useState('');

  const {
    devices,
    total,
    isLoading,
    error,
    refreshDevices,
    isRefreshingDevices,
  } = useInventoryDevices();

  const filteredDevices = useMemo(
    () => devices.filter((device) => matchesSearch(device, search)),
    [devices, search]
  );

  const totalWithTpm = useMemo(
    () => devices.filter((device) => device.tpm_present === true).length,
    [devices]
  );

  const totalWithSecureBoot = useMemo(
    () => devices.filter((device) => device.secure_boot_enabled === true).length,
    [devices]
  );

  const totalWindows = useMemo(
    () =>
      devices.filter((device) =>
        String(device.os_name || '').toLowerCase().includes('windows')
      ).length,
    [devices]
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Inventário
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão geral dos computadores inventariados pelo Gabriel.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshDevices()}
          disabled={isRefreshingDevices}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshingDevices ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Dispositivos"
          value={total}
          description="Máquinas inventariadas"
        />
        <SummaryCard
          label="Windows"
          value={totalWindows}
          description="Estações com Windows"
        />
        <SummaryCard
          label="Com TPM"
          value={totalWithTpm}
          description="TPM detectado"
        />
        <SummaryCard
          label="Com Secure Boot"
          value={totalWithSecureBoot}
          description="Inicialização segura ativa"
        />
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Dispositivos
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Exibindo {filteredDevices.length} de {total} dispositivo(s).
              </p>
            </div>

            <div className="w-full lg:max-w-md">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Buscar dispositivo
              </label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hostname, serial, IP, modelo..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Erro ao carregar inventário.
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm text-slate-500">
            Carregando inventário...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum dispositivo encontrado. Atualize o inventário patrimonial na tela de detalhes do agente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Hostname</th>
                  <th className="px-5 py-3">Fabricante</th>
                  <th className="px-5 py-3">Modelo</th>
                  <th className="px-5 py-3">Serial</th>
                  <th className="px-5 py-3">Sistema</th>
                  <th className="px-5 py-3">CPU</th>
                  <th className="px-5 py-3">RAM</th>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3">TPM</th>
                  <th className="px-5 py-3">Secure Boot</th>
                  <th className="px-5 py-3">Última coleta</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.agent_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {getDeviceName(device)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {valueOrDash(device.manufacturer)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {valueOrDash(device.model)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {valueOrDash(device.serial_number)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      <div>{valueOrDash(device.os_name)}</div>
                      <div className="text-xs text-slate-400">
                        {valueOrDash(device.os_version)}
                      </div>
                    </td>

                    <td className="max-w-[260px] px-5 py-4 text-slate-700">
                      <div className="truncate" title={device.processor_name || ''}>
                        {valueOrDash(device.processor_name)}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {device.ram_total_gb ? `${device.ram_total_gb} GB` : '—'}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {valueOrDash(device.primary_ip)}
                    </td>

                    <td className="px-5 py-4">
                      {statusBadge(device.tpm_present)}
                    </td>

                    <td className="px-5 py-4">
                      {statusBadge(device.secure_boot_enabled)}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {formatDate(device.collected_at || device.updated_at)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/agents/${device.agent_id}`}
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
