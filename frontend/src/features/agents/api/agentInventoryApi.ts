import { api } from '../../../api/httpClient';

export type AgentInventory = {
  id: string;
  tenant_id: string;
  agent_id: string;
  source_command_id?: string | null;

  hostname?: string | null;
  domain_name?: string | null;
  logged_user?: string | null;

  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;

  os_name?: string | null;
  os_version?: string | null;
  os_build?: string | null;
  architecture?: string | null;

  processor_name?: string | null;
  cpu_cores?: number | null;
  cpu_threads?: number | null;

  ram_total_gb?: number | string | null;
  primary_ip?: string | null;

  tpm_present?: boolean | null;
  tpm_ready?: boolean | null;
  secure_boot_enabled?: boolean | null;

  disks?: Array<Record<string, any>>;
  memory_modules?: Array<Record<string, any>>;
  network_adapters?: Array<Record<string, any>>;
  video_controllers?: Array<Record<string, any>>;
  printers?: Array<Record<string, any>>;
  hardware?: Record<string, any>;
  raw_diagnostics?: Record<string, any>;

  collected_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AgentInventoryResponse = {
  inventory: AgentInventory | null;
};

export async function getAgentInventory(agentId: string): Promise<AgentInventoryResponse> {
  const response = await api.get<AgentInventoryResponse>(`/agents/${agentId}/inventory`);
  return response.data;
}

export async function refreshAgentInventoryFromLatestDiagnostics(
  agentId: string
): Promise<AgentInventoryResponse> {
  const response = await api.post<AgentInventoryResponse>(
    `/agents/${agentId}/inventory/from-latest-diagnostics`
  );

  return response.data;
}
