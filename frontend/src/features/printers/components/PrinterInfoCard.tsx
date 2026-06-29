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

function InfoItem({ label, value }: { label: string; value?: string | boolean | null }) {
  let displayValue = '-';

  if (typeof value === 'boolean') {
    displayValue = value ? 'Sim' : 'Não';
  } else if (value) {
    displayValue = value;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-slate-800">
        {displayValue}
      </p>
    </div>
  );
}

export function PrinterInfoCard({ printer }: { printer: Printer }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card className="p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {getPrinterName(printer)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              ID: {printer.id}
            </p>
          </div>

          <PrinterStatusBadge printer={printer} />
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem label="Driver" value={printer.driver_name} />
          <InfoItem label="Porta" value={printer.port_name} />
          <InfoItem label="Compartilhamento" value={printer.share_name} />
          <InfoItem label="Localização" value={printer.location} />
          <InfoItem label="Comentário" value={printer.comment} />
          <InfoItem label="Status bruto" value={printer.status} />
          <InfoItem label="É padrão?" value={printer.is_default} />
          <InfoItem label="Compartilhada?" value={printer.is_shared} />
          <InfoItem label="Impressora de rede?" value={printer.is_network} />
          <InfoItem label="Online?" value={printer.is_online} />
          <InfoItem label="Última visualização" value={formatDate(printer.last_seen_at)} />
          <InfoItem label="Atualizado em" value={formatDate(printer.updated_at)} />
          <InfoItem label="Criado em" value={formatDate(printer.created_at)} />
          <InfoItem label="Tenant ID" value={printer.tenant_id} />
          <InfoItem label="Agent ID" value={printer.agent_id} />
        </div>

        {printer.agent_id && (
          <div className="mt-6">
            <Link
              to={`/agents/${printer.agent_id}`}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Ver agente vinculado →
            </Link>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-950">
          Ações rápidas
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Envie comandos para o agente responsável por esta impressora.
        </p>

        <div className="mt-5">
          <PrinterActions printer={printer} />
        </div>
      </Card>
    </div>
  );
}
