import { Link } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import type { Printer } from '../types';
import { PrinterActions } from './PrinterActions';
import { PrinterStatusBadge } from './PrinterStatusBadge';

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

function getPrinterName(printer: Printer) {
  return printer.name || printer.printer_name || 'Impressora sem nome';
}

export function PrintersTable({ printers }: { printers: Printer[] }) {
  if (printers.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-950">
          Nenhuma impressora encontrada
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Quando o agente enviar inventário de impressoras, elas aparecerão aqui.
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
                Impressora
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Agente
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Driver
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Porta
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Flags
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Última atualização
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ações
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {printers.map((printer) => (
              <tr key={printer.id} className="align-top hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-950">
                    {getPrinterName(printer)}
                  </p>

                  <div className="mt-1 flex flex-col gap-1">
                    <p className="text-xs text-slate-500">
                      {printer.share_name ? `Compartilhamento: ${printer.share_name}` : printer.id}
                    </p>

                    <Link
                      to={`/printers/${printer.id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {printer.agent_hostname || printer.agent_id || '-'}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {printer.driver_name || '-'}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {printer.port_name || '-'}
                </td>

                <td className="px-5 py-4">
                  <PrinterStatusBadge printer={printer} />
                </td>

                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {printer.is_default && (
                      <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                        Padrão
                      </span>
                    )}

                    {printer.is_shared && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                        Compartilhada
                      </span>
                    )}

                    {printer.is_network && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                        Rede
                      </span>
                    )}

                    {!printer.is_default && !printer.is_shared && !printer.is_network && '-'}
                  </div>
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {formatDate(printer.last_seen_at || printer.updated_at)}
                </td>

                <td className="px-5 py-4">
                  <PrinterActions printer={printer} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
