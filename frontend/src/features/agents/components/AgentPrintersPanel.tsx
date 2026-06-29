import { useState } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import { PrintersTable } from '../../printers/components/PrintersTable';
import { useAgentPrinters } from '../../printers/hooks/useAgentPrinters';

export function AgentPrintersPanel({ agentId }: { agentId: string }) {
  const [successMessage, setSuccessMessage] = useState('');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgentPrinters(agentId);

  const createCommandMutation = useCreateCommand();

  const printers = data?.items || [];

  async function handleCollectInventory() {
    setSuccessMessage('');

    await createCommandMutation.mutateAsync({
      agent_id: agentId,
      command_type: 'collect_inventory',
      payload: {
        reason: 'manual_printer_inventory_request',
        source: 'agent_printers_panel',
      },
    });

    setSuccessMessage('Comando de coleta de inventário enviado para este agente.');
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Impressoras do agente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Impressoras detectadas neste computador/agente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCollectInventory}
            disabled={createCommandMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createCommandMutation.isPending ? 'Enviando...' : 'Solicitar inventário'}
          </button>

          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {successMessage && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>
          <p className="mt-1 text-sm text-emerald-700">
            Você pode acompanhar o andamento na aba Comandos deste agente.
          </p>
        </Card>
      )}

      {createCommandMutation.isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível solicitar o inventário.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {createCommandMutation.error instanceof Error
              ? createCommandMutation.error.message
              : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {data?.warning && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <Badge variant="warning">Aviso</Badge>
          <p className="mt-2 text-sm text-amber-700">
            A tela está pronta, mas o backend ainda não possui inventário real de impressoras para este agente.
          </p>
        </Card>
      )}

      {printers.length === 0 && !isLoading && (
        <Card className="mb-4 border-blue-200 bg-blue-50 p-4">
          <Badge variant="info">Inventário</Badge>
          <p className="mt-2 text-sm text-blue-800">
            Nenhuma impressora foi encontrada ainda. Clique em <strong>Solicitar inventário</strong> para enviar um comando ao agente.
          </p>
        </Card>
      )}

      {isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar as impressoras deste agente.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-16 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Total de <strong>{printers.length}</strong> impressoras para este agente.
          </div>

          <PrintersTable printers={printers} />
        </>
      )}
    </div>
  );
}
