import { useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import type { CommandType } from '../../commands/types';
import type { Printer } from '../types';

function getPrinterName(printer: Printer) {
  return printer.name || printer.printer_name || 'Impressora sem nome';
}

type PrinterActionVariant = 'default' | 'primary' | 'danger';

type PrinterAction = {
  label: string;
  description: string;
  commandType: CommandType;
  variant?: PrinterActionVariant;
  requiresConfirmation?: boolean;
  payloadFactory: (printer: Printer) => Record<string, unknown>;
};

const actions: PrinterAction[] = [
  {
    label: 'Reiniciar Spooler',
    description: 'Reinicia o serviço de impressão do Windows.',
    commandType: 'restart_spooler',
    payloadFactory: (printer) => ({
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
      port_name: printer.port_name || null,
      driver_name: printer.driver_name || null,
    }),
  },
  {
    label: 'Limpar fila',
    description: 'Limpa a fila da impressora selecionada.',
    commandType: 'clear_print_queue',
    payloadFactory: (printer) => ({
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
      port_name: printer.port_name || null,
      driver_name: printer.driver_name || null,
    }),
  },
  {
    label: 'Coletar inventário',
    description: 'Solicita nova coleta de inventário de impressoras.',
    commandType: 'collect_inventory',
    payloadFactory: (printer) => ({
      reason: 'printer_inventory_refresh',
      source: 'printer_actions',
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
    }),
  },
  {
    label: 'Definir como padrão',
    description: 'Define esta impressora como padrão no computador do agente.',
    commandType: 'set_default_printer',
    variant: 'primary',
    payloadFactory: (printer) => ({
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
      port_name: printer.port_name || null,
    }),
  },
  {
    label: 'Página de teste',
    description: 'Solicita impressão de uma página de teste.',
    commandType: 'print_test_page',
    payloadFactory: (printer) => ({
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
      port_name: printer.port_name || null,
    }),
  },
  {
    label: 'Remover impressora',
    description: 'Remove esta impressora do computador do agente.',
    commandType: 'remove_printer',
    variant: 'danger',
    requiresConfirmation: true,
    payloadFactory: (printer) => ({
      printer_id: printer.id,
      printer_name: getPrinterName(printer),
      port_name: printer.port_name || null,
      driver_name: printer.driver_name || null,
    }),
  },
];

function getButtonClassName(variant: PrinterActionVariant = 'default') {
  if (variant === 'primary') {
    return 'rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  }

  if (variant === 'danger') {
    return 'rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
  }

  return 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
}

export function PrinterActions({ printer }: { printer: Printer }) {
  const [message, setMessage] = useState('');
  const createCommandMutation = useCreateCommand();

  async function handleAction(action: PrinterAction) {
    setMessage('');

    if (!printer.agent_id) {
      setMessage('Esta impressora não possui agente vinculado.');
      return;
    }

    if (action.requiresConfirmation) {
      const confirmed = window.confirm(
        `Tem certeza que deseja enviar o comando "${action.label}" para a impressora "${getPrinterName(printer)}"?`,
      );

      if (!confirmed) {
        return;
      }
    }

    await createCommandMutation.mutateAsync({
      agent_id: printer.agent_id,
      command_type: action.commandType,
      payload: action.payloadFactory(printer),
    });

    setMessage(`Comando "${action.label}" enviado.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.commandType}
            type="button"
            onClick={() => handleAction(action)}
            disabled={createCommandMutation.isPending || !printer.agent_id}
            className={getButtonClassName(action.variant)}
            title={action.description}
          >
            {createCommandMutation.isPending ? 'Enviando...' : action.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="text-xs font-semibold text-emerald-700">
          {message}
        </p>
      )}

      {createCommandMutation.isError && (
        <Card className="border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">
            Não foi possível enviar o comando.
          </p>
          <pre className="mt-1 whitespace-pre-wrap text-[11px] text-red-600">
            {createCommandMutation.error instanceof Error
              ? createCommandMutation.error.message
              : 'Erro desconhecido'}
          </pre>
        </Card>
      )}
    </div>
  );
}
