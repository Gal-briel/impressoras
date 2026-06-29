import { Card } from '../../../components/ui/Card';
import type { AgentEvent } from '../types';
import { EventSeverityBadge } from './EventSeverityBadge';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getEventType(event: AgentEvent) {
  return event.event_type || event.type || 'event';
}

function stringifyDetails(value: AgentEvent['payload']) {
  if (!value) {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '-';
  }
}

export function AgentEventsTable({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-950">
          Nenhum evento encontrado
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Quando o agente enviar eventos, eles aparecerão aqui.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evento
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Severidade
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mensagem
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Detalhes
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {events.map((event) => (
              <tr key={event.id} className="align-top hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-950">{getEventType(event)}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.id}</p>
                </td>

                <td className="px-5 py-4">
                  <EventSeverityBadge event={event} />
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {event.message || '-'}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {formatDate(event.created_at)}
                </td>

                <td className="px-5 py-4">
                  <pre className="max-w-md whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {stringifyDetails(event.payload || event.details)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
