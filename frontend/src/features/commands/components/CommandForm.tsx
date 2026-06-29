import { FormEvent, useEffect, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import type { CommandType, CreateCommandPayload } from '../types';

type CommandFormProps = {
  onSubmit: (payload: CreateCommandPayload) => Promise<void> | void;
  isSubmitting?: boolean;
  initialAgentId?: string;
  lockAgentId?: boolean;
};

const commandOptions: Array<{ value: CommandType; label: string; description: string }> = [
  {
    value: 'restart_spooler',
    label: 'Reiniciar Spooler',
    description: 'Reinicia o serviço de impressão do Windows.',
  },
  {
    value: 'clear_print_queue',
    label: 'Limpar fila de impressão',
    description: 'Remove trabalhos presos na fila.',
  },
  {
    value: 'collect_inventory',
    label: 'Coletar inventário',
    description: 'Solicita inventário atualizado do agente.',
  },
  {
    value: 'install_printer',
    label: 'Instalar impressora',
    description: 'Preparado para instalação remota de impressora.',
  },
  {
    value: 'restart_service',
    label: 'Reiniciar serviço',
    description: 'Reinicia um serviço específico pelo nome.',
  },
  {
    value: 'set_default_printer',
    label: 'Definir impressora padrão',
    description: 'Define uma impressora como padrão no computador.',
  },
  {
    value: 'remove_printer',
    label: 'Remover impressora',
    description: 'Remove uma impressora do computador.',
  },
  {
    value: 'print_test_page',
    label: 'Imprimir página de teste',
    description: 'Solicita impressão de página de teste.',
  },
];

export function CommandForm({
  onSubmit,
  isSubmitting = false,
  initialAgentId = '',
  lockAgentId = false,
}: CommandFormProps) {
  const [agentId, setAgentId] = useState(initialAgentId);
  const [commandType, setCommandType] = useState<CommandType>('restart_spooler');
  const [serviceName, setServiceName] = useState('Spooler');
  const [printerName, setPrinterName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialAgentId) {
      setAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!agentId.trim()) {
      setError('Informe o ID do agente.');
      return;
    }

    setError('');

    const payload: Record<string, unknown> = {};

    if (commandType === 'restart_service') {
      payload.service_name = serviceName || 'Spooler';
    }

    if (
      ['install_printer', 'set_default_printer', 'remove_printer', 'print_test_page'].includes(commandType)
      && printerName
    ) {
      payload.printer_name = printerName;
    }

    await onSubmit({
      agent_id: agentId.trim(),
      command_type: commandType,
      payload,
    });

    setPrinterName('');
  }

  const selectedCommand = commandOptions.find((option) => option.value === commandType);

  const shouldShowPrinterName = [
    'install_printer',
    'set_default_printer',
    'remove_printer',
    'print_test_page',
  ].includes(commandType);

  return (
    <Card className="p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">Criar comando</h2>
        <p className="mt-1 text-sm text-slate-500">
          Envie uma ação remota para um agente específico.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <Input
          label="ID do agente"
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          placeholder="Cole aqui o ID do agente"
          disabled={lockAgentId}
          className={lockAgentId ? 'bg-slate-100 text-slate-500' : ''}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Tipo de comando
          </span>
          <select
            value={commandType}
            onChange={(event) => setCommandType(event.target.value as CommandType)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {commandOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {selectedCommand && (
            <p className="mt-2 text-xs text-slate-500">
              {selectedCommand.description}
            </p>
          )}
        </label>

        {commandType === 'restart_service' && (
          <Input
            label="Nome do serviço"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="Spooler"
          />
        )}

        {shouldShowPrinterName && (
          <Input
            label="Nome da impressora"
            value={printerName}
            onChange={(event) => setPrinterName(event.target.value)}
            placeholder="HP LaserJet Financeiro"
          />
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Enviando comando...' : 'Enviar comando'}
        </Button>
      </form>
    </Card>
  );
}
