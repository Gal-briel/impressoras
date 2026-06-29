import type { ReactNode } from 'react';

type HardwareValue = Record<string, any>;

type Props = {
  hardware?: HardwareValue;
};

function normalizeRows(value: unknown): HardwareValue[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === 'object') as HardwareValue[];
  }

  if (typeof value === 'object') {
    return [value as HardwareValue];
  }

  return [];
}

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';

  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.join(', ');
  }

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  return String(value);
}

function hasUsefulObjectData(value: unknown) {
  if (!value || typeof value !== 'object') return false;

  return Object.values(value as HardwareValue).some((item) => {
    if (item === null || item === undefined || item === '') return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return true;
  });
}

function hasRows(value: unknown) {
  return normalizeRows(value).length > 0;
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-3 border-b py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{valueOrDash(value)}</span>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  emptyMessage = 'Nenhum item retornado.',
}: {
  columns: Array<{ key: string; label: string }>;
  rows?: unknown;
  emptyMessage?: string;
}) {
  const safeRows = normalizeRows(rows);

  if (safeRows.length === 0) {
    return <div className="text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
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
  );
}

export function AgentHardwareSection({ hardware }: Props) {
  if (!hardware) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Inventário avançado de hardware ainda não encontrado. Execute um novo diagnóstico.
      </div>
    );
  }

  if (hardware.error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        Erro ao coletar hardware: {String(hardware.error)}
      </div>
    );
  }

  const computer = hardware.computer_system || {};
  const bios = hardware.bios || {};
  const baseboard = hardware.baseboard || {};
  const tpm = hardware.tpm || {};
  const secureBoot = hardware.secure_boot || {};
  const pnpSummary = hardware.pnp_summary || {};

  const showComputer = hasUsefulObjectData(computer);
  const showBios = hasUsefulObjectData(bios);
  const showBaseboard = hasUsefulObjectData(baseboard);
  const showTpm = hasUsefulObjectData(tpm);
  const showSecureBoot = hasUsefulObjectData(secureBoot);
  const showPnpSummary = hasUsefulObjectData(pnpSummary);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-base font-semibold text-slate-900">
          Inventário avançado de hardware
        </h3>
        <p className="text-sm text-slate-500">
          Dados técnicos coletados diretamente no Windows.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {showComputer ? (
          <SectionCard title="Equipamento">
            <div className="text-sm">
              <InfoRow label="Fabricante" value={computer.manufacturer} />
              <InfoRow label="Modelo" value={computer.model} />
              <InfoRow label="Nome" value={computer.name} />
              <InfoRow label="Domínio" value={computer.domain} />
              <InfoRow label="Memória física" value={computer.total_physical_memory_gb ? `${computer.total_physical_memory_gb} GB` : null} />
              <InfoRow label="Tipo" value={computer.system_type} />
            </div>
          </SectionCard>
        ) : null}

        {showBios ? (
          <SectionCard title="BIOS / Serial">
            <div className="text-sm">
              <InfoRow label="Fabricante" value={bios.manufacturer} />
              <InfoRow label="Versão" value={bios.version} />
              <InfoRow label="Serial/Service Tag" value={bios.serial_number} />
              <InfoRow label="Data" value={bios.release_date} />
            </div>
          </SectionCard>
        ) : null}

        {showBaseboard ? (
          <SectionCard title="Placa-mãe">
            <div className="text-sm">
              <InfoRow label="Fabricante" value={baseboard.manufacturer} />
              <InfoRow label="Produto" value={baseboard.product} />
              <InfoRow label="Versão" value={baseboard.version} />
              <InfoRow label="Serial" value={baseboard.serial_number} />
            </div>
          </SectionCard>
        ) : null}

        {showTpm ? (
          <SectionCard title="TPM">
            <div className="text-sm">
              <InfoRow label="Presente" value={tpm.present} />
              <InfoRow label="Pronto" value={tpm.ready} />
              <InfoRow label="Habilitado" value={tpm.enabled} />
              <InfoRow label="Ativado" value={tpm.activated} />
              <InfoRow label="Fabricante" value={tpm.manufacturer} />
              <InfoRow label="Versão" value={tpm.manufacturer_version} />
            </div>
          </SectionCard>
        ) : null}

        {showSecureBoot ? (
          <SectionCard title="Secure Boot">
            <div className="text-sm">
              <InfoRow label="Habilitado" value={secureBoot.enabled} />
              <InfoRow label="Erro" value={secureBoot.error} />
            </div>
          </SectionCard>
        ) : null}

        {showPnpSummary ? (
          <SectionCard title="Dispositivos">
            <div className="text-sm">
              <InfoRow label="Total PnP" value={pnpSummary.total_devices} />
              <InfoRow label="Com erro" value={pnpSummary.error_devices} />
            </div>
          </SectionCard>
        ) : null}
      </div>

      {hasRows(hardware.processors) ? (
        <SectionCard title="Processador">
          <SimpleTable
            rows={hardware.processors}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'socket_designation', label: 'Socket' },
              { key: 'cores', label: 'Cores' },
              { key: 'logical_processors', label: 'Threads' },
              { key: 'max_clock_mhz', label: 'MHz máx.' },
              { key: 'virtualization_firmware_enabled', label: 'Virtualização' },
            ]}
          />
        </SectionCard>
      ) : null}

      {hasRows(hardware.memory_modules) ? (
        <SectionCard title="Memórias físicas">
          <SimpleTable
            rows={hardware.memory_modules}
            columns={[
              { key: 'device_locator', label: 'Slot' },
              { key: 'manufacturer', label: 'Fabricante' },
              { key: 'capacity_gb', label: 'GB' },
              { key: 'speed_mhz', label: 'MHz' },
              { key: 'part_number', label: 'Part number' },
              { key: 'serial_number', label: 'Serial' },
            ]}
          />
        </SectionCard>
      ) : null}

      {hasRows(hardware.physical_disks) ? (
        <SectionCard title="Discos físicos">
          <SimpleTable
            rows={hardware.physical_disks}
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
        </SectionCard>
      ) : null}

      {hasRows(hardware.volumes) ? (
        <SectionCard title="Volumes / partições">
          <SimpleTable
            rows={hardware.volumes}
            columns={[
              { key: 'drive_letter', label: 'Unidade' },
              { key: 'file_system', label: 'Sistema' },
              { key: 'file_system_label', label: 'Rótulo' },
              { key: 'size_gb', label: 'GB' },
              { key: 'free_gb', label: 'Livre' },
              { key: 'health_status', label: 'Saúde' },
            ]}
          />
        </SectionCard>
      ) : null}

      {hasRows(hardware.video_controllers) ? (
        <SectionCard title="Placa de vídeo">
          <SimpleTable
            rows={hardware.video_controllers}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'video_processor', label: 'Processador' },
              { key: 'adapter_ram_gb', label: 'VRAM GB' },
              { key: 'driver_version', label: 'Driver' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </SectionCard>
      ) : null}

      {hasRows(hardware.network_adapters) ? (
        <SectionCard title="Rede">
          <SimpleTable
            rows={hardware.network_adapters}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'interface_description', label: 'Descrição' },
              { key: 'status', label: 'Status' },
              { key: 'mac_address', label: 'MAC' },
              { key: 'link_speed', label: 'Velocidade' },
              { key: 'ipv4', label: 'IPv4' },
            ]}
          />
        </SectionCard>
      ) : null}

      {Array.isArray(pnpSummary.error_items) && pnpSummary.error_items.length > 0 ? (
        <SectionCard title="Dispositivos com erro">
          <SimpleTable
            rows={pnpSummary.error_items}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'error_code', label: 'Código' },
              { key: 'status', label: 'Status' },
              { key: 'device_id', label: 'Device ID' },
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
