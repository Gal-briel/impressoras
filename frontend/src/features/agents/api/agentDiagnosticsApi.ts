import { api } from '../../../api/httpClient';
import { createCommandIdempotencyKey } from '../../commands/utils/idempotency';

export type AgentCommandSummary = {
  id: string;
  command_type?: string;
  type?: string;
  status?: string;
  output?: string | null;
  result?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DiagnosticPrinter = {
  name?: string;
  driver_name?: string;
  port_name?: string;
  status?: string;
  is_default?: boolean;
  is_shared?: boolean;
  is_network?: boolean;
  is_online?: boolean;
};

export type DiagnosticsData = {
  hostname?: string;
  user?: string;
  domain?: string;
  os?: {
    system?: string;
    release?: string;
    version?: string;
    machine?: string;
    processor?: string;
  };
  network?: {
    internal_ip?: string | null;
  };
  cpu?: {
    count_logical?: number;
    count_physical?: number;
    percent?: number;
  };
  memory?: {
    total_gb?: number;
    available_gb?: number;
    used_gb?: number;
    percent?: number;
  };
  disks?: Array<{
    device?: string;
    mountpoint?: string;
    fstype?: string;
    total_gb?: number;
    used_gb?: number;
    free_gb?: number;
    percent?: number;
  }>;
  uptime?: {
    boot_time_epoch?: number;
    uptime_seconds?: number;
  };
  spooler?: {
    status?: string;
  };
  printers?: {
    count?: number;
    error?: string | null;
    items?: DiagnosticPrinter[];
  };
  hardware?: Record<string, any>;
};

export type LatestDiagnosticsResult = {
  latestCommand?: AgentCommandSummary;
  diagnostics?: DiagnosticsData;
  pendingCommand?: AgentCommandSummary;
  failedCommand?: AgentCommandSummary;
};

function getCommandType(command: AgentCommandSummary) {
  return command.command_type || command.type || '';
}

function asArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  return [];
}

function pick(source: any, ...keys: string[]) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }

  return undefined;
}

function bytesToGb(value: any) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;

  return Number((numberValue / 1024 / 1024 / 1024).toFixed(2));
}

function normalizeHardware(rawHardware: any) {
  if (!rawHardware || typeof rawHardware !== 'object') return rawHardware;

  const computer = rawHardware.computer_system || rawHardware.computer || {};
  const cpu = rawHardware.cpu || {};
  const diskRows = asArray(rawHardware.physical_disks || rawHardware.disks);
  const gpuRows = asArray(rawHardware.video_controllers || rawHardware.gpus);
  const networkRows = asArray(rawHardware.network_adapters);

  return {
    ...rawHardware,

    computer_system: {
      ...computer,
      manufacturer: pick(computer, 'manufacturer', 'Manufacturer'),
      model: pick(computer, 'model', 'Model'),
      name: pick(computer, 'name', 'Name'),
      domain: pick(computer, 'domain', 'Domain'),
      total_physical_memory_gb:
        pick(computer, 'total_physical_memory_gb') ||
        bytesToGb(pick(computer, 'TotalPhysicalMemory')),
      system_type: pick(computer, 'system_type', 'SystemType'),
    },

    bios: {
      ...(rawHardware.bios || {}),
      manufacturer: pick(rawHardware.bios, 'manufacturer', 'Manufacturer'),
      version: pick(rawHardware.bios, 'version', 'Version', 'SMBIOSBIOSVersion'),
      serial_number: pick(rawHardware.bios, 'serial_number', 'SerialNumber'),
      release_date: pick(rawHardware.bios, 'release_date', 'ReleaseDate'),
    },

    baseboard: {
      ...(rawHardware.baseboard || {}),
      manufacturer: pick(rawHardware.baseboard, 'manufacturer', 'Manufacturer'),
      product: pick(rawHardware.baseboard, 'product', 'Product'),
      version: pick(rawHardware.baseboard, 'version', 'Version'),
      serial_number: pick(rawHardware.baseboard, 'serial_number', 'SerialNumber'),
    },

    processors: asArray(rawHardware.processors || cpu).map((item) => ({
      ...item,
      name: pick(item, 'name', 'Name'),
      manufacturer: pick(item, 'manufacturer', 'Manufacturer'),
      cores: pick(item, 'cores', 'NumberOfCores'),
      logical_processors: pick(item, 'logical_processors', 'NumberOfLogicalProcessors'),
      max_clock_mhz: pick(item, 'max_clock_mhz', 'MaxClockSpeed'),
      socket_designation: pick(item, 'socket_designation', 'SocketDesignation'),
    })),

    physical_disks: diskRows.map((item) => ({
      ...item,
      friendly_name: pick(item, 'friendly_name', 'FriendlyName', 'Model'),
      model: pick(item, 'model', 'Model'),
      media_type: pick(item, 'media_type', 'MediaType'),
      bus_type: pick(item, 'bus_type', 'BusType', 'InterfaceType'),
      size_gb: pick(item, 'size_gb') || bytesToGb(pick(item, 'Size')),
      health_status: pick(item, 'health_status', 'HealthStatus', 'Status'),
      serial_number: pick(item, 'serial_number', 'SerialNumber'),
    })),

    video_controllers: gpuRows.map((item) => ({
      ...item,
      name: pick(item, 'name', 'Name'),
      adapter_ram_gb: pick(item, 'adapter_ram_gb') || bytesToGb(pick(item, 'AdapterRAM')),
      driver_version: pick(item, 'driver_version', 'DriverVersion'),
      status: pick(item, 'status', 'Status'),
      video_processor: pick(item, 'video_processor', 'VideoProcessor'),
    })),

    network_adapters: networkRows.map((item) => ({
      ...item,
      name: pick(item, 'name', 'Name', 'Description'),
      interface_description: pick(item, 'interface_description', 'InterfaceDescription', 'Description'),
      status: pick(item, 'status', 'Status'),
      mac_address: pick(item, 'mac_address', 'MACAddress'),
      ipv4: Array.isArray(item?.IPAddress)
        ? item.IPAddress.join(', ')
        : pick(item, 'ipv4', 'IPAddress'),
      link_speed: pick(item, 'link_speed', 'Speed', 'LinkSpeed'),
    })),
  };
}

function normalizeDiagnostics(data: DiagnosticsData): DiagnosticsData {
  const hardware = normalizeHardware(data.hardware);
  const hardwareCpu = data.hardware?.cpu || {};
  const hardwareComputer = data.hardware?.computer || data.hardware?.computer_system || {};
  const hardwareDisks = asArray(data.hardware?.disks || data.hardware?.physical_disks);

  return {
    ...data,

    cpu: data.cpu || {
      count_physical: pick(hardwareCpu, 'count_physical', 'NumberOfCores'),
      count_logical: pick(hardwareCpu, 'count_logical', 'NumberOfLogicalProcessors'),
      percent: pick(hardwareCpu, 'percent'),
    },

    memory: data.memory || {
      total_gb:
        pick(hardwareComputer, 'total_physical_memory_gb') ||
        bytesToGb(pick(hardwareComputer, 'TotalPhysicalMemory')),
      available_gb: undefined,
      used_gb: undefined,
      percent: undefined,
    },

    disks:
      data.disks ||
      hardwareDisks.map((disk) => ({
        device: pick(disk, 'device', 'DeviceID', 'Model'),
        mountpoint: pick(disk, 'mountpoint', 'DriveLetter'),
        fstype: pick(disk, 'fstype', 'FileSystem'),
        total_gb: pick(disk, 'total_gb', 'size_gb') || bytesToGb(pick(disk, 'Size')),
        used_gb: pick(disk, 'used_gb'),
        free_gb: pick(disk, 'free_gb'),
        percent: pick(disk, 'percent'),
      })),

    hardware,
  };
}

function parseDiagnostics(command?: AgentCommandSummary): DiagnosticsData | undefined {
  if (!command) return undefined;

  const raw = command.output || command.result;

  if (!raw) return undefined;

  if (typeof raw !== 'string') return normalizeDiagnostics(raw as DiagnosticsData);

  try {
    return normalizeDiagnostics(JSON.parse(raw) as DiagnosticsData);
  } catch {
    return undefined;
  }
}

export async function getAgentCommands(agentId: string): Promise<AgentCommandSummary[]> {
  const response = await api.get(`/agents/${agentId}/commands`);
  const data = response.data;

  if (Array.isArray(data)) return data;

  return (data as { items?: AgentCommandSummary[] }).items || [];
}

export async function getLatestAgentDiagnostics(agentId: string): Promise<LatestDiagnosticsResult> {
  const commands = await getAgentCommands(agentId);

  const diagnosticsCommands = commands.filter(
    (command) => getCommandType(command) === 'collect_diagnostics'
  );

  const pendingCommand = diagnosticsCommands.find((command) =>
    ['queued', 'dispatched', 'acknowledged', 'executing', 'pending'].includes(
      String(command.status || '').toLowerCase()
    )
  );

  const latestSuccess = diagnosticsCommands.find((command) => {
    const status = String(command.status || '').toLowerCase();
    return status === 'success' && Boolean(parseDiagnostics(command));
  });

  const latestFailed = diagnosticsCommands.find((command) => {
    const status = String(command.status || '').toLowerCase();
    return ['failed', 'timed_out', 'timeout'].includes(status);
  });

  return {
    latestCommand: latestSuccess,
    diagnostics: parseDiagnostics(latestSuccess),
    pendingCommand,
    failedCommand: latestFailed,
  };
}

export async function createDiagnosticsCommand(agentId: string) {
  const response = await api.post(`/agents/${agentId}/commands`, {
    command_type: 'collect_diagnostics',
    payload: {},
    idempotency_key: createCommandIdempotencyKey('collect_diagnostics', agentId, 'agent-diagnostics'),
    timeout_seconds: 120,
  });

  return response.data;
}
