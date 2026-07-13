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

type NetworkPrinterProtocol = 'tcp_9100' | 'lpr_515';

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
    value: 'discover_network_printers',
    label: 'Buscar impressoras na rede',
    description: 'Procura impressoras compartilhadas e dispositivos de impressão na rede local do agente.',
  },
  {
    value: 'collect_inventory',
    label: 'Coletar inventário',
    description: 'Solicita inventário atualizado do agente.',
  },
  {
    value: 'install_network_printer',
    label: 'Instalar impressora de rede',
    description: 'Instala uma impressora de rede no computador do agente selecionado.',
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

function defaultPortForProtocol(protocol: NetworkPrinterProtocol) {
  return protocol === 'lpr_515' ? '515' : '9100';
}

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
  const [networkPrinterIp, setNetworkPrinterIp] = useState('');
  const [networkPrinterProtocol, setNetworkPrinterProtocol] = useState<NetworkPrinterProtocol>('tcp_9100');
  const [networkPrinterPort, setNetworkPrinterPort] = useState('9100');
  const [networkPrinterDriver, setNetworkPrinterDriver] = useState('');
  const [networkPrinterQueue, setNetworkPrinterQueue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialAgentId) {
      setAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  function handleProtocolChange(protocol: NetworkPrinterProtocol) {
    setNetworkPrinterProtocol(protocol);
    setNetworkPrinterPort(defaultPortForProtocol(protocol));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!agentId.trim()) {
      setError('Informe o ID do agente.');
      return;
    }

    if (commandType === 'install_network_printer' && !networkPrinterIp.trim()) {
      setError('Informe o IP da impressora de rede.');
      return;
    }

    if (commandType === 'install_network_printer' && !printerName.trim()) {
      setError('Informe o nome que a impressora terá no Windows.');
      return;
    }

    setError('');

    const payload: Record<string, unknown> = {};

    if (commandType === 'restart_service') {
      payload.service_name = serviceName || 'Spooler';
    }

    if (
      ['set_default_printer', 'remove_printer', 'print_test_page'].includes(commandType)
      && printerName
    ) {
      payload.printer_name = printerName;
    }

    if (commandType === 'install_network_printer') {
      const parsedPort = Number(networkPrinterPort || defaultPortForProtocol(networkPrinterProtocol));

      payload.printer_name = printerName.trim();
      payload.install_method = 'tcp_ip';
      payload.ip = networkPrinterIp.trim();
      payload.protocol = networkPrinterProtocol;
      payload.port = Number.isFinite(parsedPort) ? parsedPort : Number(defaultPortForProtocol(networkPrinterProtocol));
      payload.driver_name = networkPrinterDriver.trim() || null;
      payload.timeout_seconds = 180;

      if (networkPrinterProtocol === 'lpr_515') {
        payload.queue_name = networkPrinterQueue.trim() || null;
      }
    }

    await onSubmit({
      agent_id: agentId.trim(),
      command_type: commandType,
      payload,
      timeout_seconds: commandType === 'install_network_printer' ? 180 : undefined,
    });

    setPrinterName('');
    setNetworkPrinterQueue('');
  }

  const selectedCommand = commandOptions.find((option) => option.value === commandType);

  const shouldShowPrinterName = [
    'install_network_printer',
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
            label={commandType === 'install_network_printer' ? 'Nome da impressora no Windows' : 'Nome da impressora'}
            value={printerName}
            onChange={(event) => setPrinterName(event.target.value)}
            placeholder={commandType === 'install_network_printer' ? 'Ex: EPSON Financeiro' : 'HP LaserJet Financeiro'}
          />
        )}

        {commandType === 'install_network_printer' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Dados da impressora de rede
            </h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                label="IP da impressora"
                value={networkPrinterIp}
                onChange={(event) => setNetworkPrinterIp(event.target.value)}
                placeholder="Ex: 10.34.10.230"
              />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Protocolo
                </span>
                <select
                  value={networkPrinterProtocol}
                  onChange={(event) => handleProtocolChange(event.target.value as NetworkPrinterProtocol)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="tcp_9100">TCP/IP 9100</option>
                  <option value="lpr_515">LPR 515</option>
                </select>
              </label>

              <Input
                label="Porta"
                value={networkPrinterPort}
                onChange={(event) => setNetworkPrinterPort(event.target.value)}
                placeholder={defaultPortForProtocol(networkPrinterProtocol)}
              />

              <Input
                label="Driver"
                value={networkPrinterDriver}
                onChange={(event) => setNetworkPrinterDriver(event.target.value)}
                placeholder="Ex: EPSON L355 Series"
              />

              {networkPrinterProtocol === 'lpr_515' && (
                <Input
                  label="Fila LPR"
                  value={networkPrinterQueue}
                  onChange={(event) => setNetworkPrinterQueue(event.target.value)}
                  placeholder="Ex: print, lp, queue ou nome informado pelo servidor"
                />
              )}
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Se o driver ficar vazio, o agente retornará a lista de drivers disponíveis no computador de destino.
              Para LPR/515, a fila LPR é obrigatória antes da instalação real.
            </div>
          </div>
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
