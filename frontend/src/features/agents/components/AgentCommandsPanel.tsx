import { useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { CommandForm } from '../../commands/components/CommandForm';
import { CommandsTable } from '../../commands/components/CommandsTable';
import { useAgentCommands } from '../../commands/hooks/useAgentCommands';
import { useCreateCommand } from '../../commands/hooks/useCommands';
import type { CreateCommandPayload } from '../../commands/types';

type AgentCommandsPanelProps = {
  agentId: string;
};

export function AgentCommandsPanel({ agentId }: AgentCommandsPanelProps) {
  const [successMessage, setSuccessMessage] = useState('');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgentCommands(agentId);

  const createCommandMutation = useCreateCommand();

  const commands = data?.items || [];

  async function handleCreateCommand(payload: CreateCommandPayload) {
    setSuccessMessage('');

    await createCommandMutation.mutateAsync(payload);

    setSuccessMessage('Comando enviado com sucesso para este agente.');
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <CommandForm
          initialAgentId={agentId}
          lockAgentId
          onSubmit={handleCreateCommand}
          isSubmitting={createCommandMutation.isPending}
        />

        {successMessage && (
          <Card className="border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>
          </Card>
        )}

        {createCommandMutation.isError && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">
              Não foi possível criar o comando.
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {createCommandMutation.error instanceof Error
                ? createCommandMutation.error.message
                : 'Erro desconhecido'}
            </pre>
          </Card>
        )}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Histórico do agente
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Comandos enviados para este agente específico.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {isError && (
          <Card className="mb-4 border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">
              Não foi possível carregar os comandos deste agente.
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
              Total de <strong>{commands.length}</strong> comandos para este agente.
            </div>

            <CommandsTable commands={commands} />
          </>
        )}
      </div>
    </div>
  );
}
