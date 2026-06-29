import { api } from '../../../api/httpClient';

export type InventoryDevice = {
  id: string;
  tenant_id: string;
  agent_id: string;

  hostname?: string | null;
  agent_hostname?: string | null;

  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;

  os_name?: string | null;
  os_version?: string | null;

  processor_name?: string | null;
  ram_total_gb?: number | string | null;
  primary_ip?: string | null;

  tpm_present?: boolean | null;
  tpm_ready?: boolean | null;
  secure_boot_enabled?: boolean | null;

  collected_at?: string | null;
  updated_at?: string | null;
};

export type InventoryDevicesResponse = {
  items: InventoryDevice[];
  total: number;
};

export async function listInventoryDevices(): Promise<InventoryDevicesResponse> {
  const response = await api.get<InventoryDevicesResponse>('/inventory/devices');
  return response.data;
}
