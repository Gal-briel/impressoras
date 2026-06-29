import axios from 'axios';

import { api } from '../../../api/httpClient';
import type { AgentEvent, AgentEventsResponse } from '../types';

function normalizeEventsResponse(data: AgentEventsResponse | AgentEvent[]): AgentEventsResponse {
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

export async function getAgentEvents(agentId: string): Promise<AgentEventsResponse> {
  try {
    const response = await api.get<AgentEventsResponse | AgentEvent[]>(
      `/agents/${agentId}/events`
    );

    return normalizeEventsResponse(response.data);
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
