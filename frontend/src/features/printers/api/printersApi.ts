import axios from 'axios';

import { api } from '../../../api/httpClient';
import type { Printer, PrintersResponse } from '../types';

function normalizePrintersResponse(data: PrintersResponse | Printer[]): PrintersResponse {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
    };
  }

  return {
    items: data.items || [],
    total: data.total ?? data.items?.length ?? 0,
    warning: data.warning,
  };
}

export async function getPrinters(): Promise<PrintersResponse> {
  try {
    const response = await api.get<PrintersResponse | Printer[]>('/printers');
    return normalizePrintersResponse(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        items: [],
        total: 0,
      };
    }

    throw error;
  }
}

export async function getAgentPrinters(agentId: string): Promise<PrintersResponse> {
  try {
    const response = await api.get<PrintersResponse | Printer[]>(
      `/agents/${agentId}/printers`
    );

    return normalizePrintersResponse(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        items: [],
        total: 0,
      };
    }

    throw error;
  }
}

export async function getPrinterById(printerId: string): Promise<Printer> {
  const response = await api.get<Printer>(`/printers/${printerId}`);
  return response.data;
}
