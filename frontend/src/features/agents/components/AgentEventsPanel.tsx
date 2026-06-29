import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { AgentEventsTable } from './AgentEventsTable';

export function AgentEventsPanel({ agentId }: { agentId: string }) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgentEvents(agentId);

  const events = data?.items || [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Eventos do agente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Histórico técnico enviado pelo agente para diagnóstico e auditoria.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {isFetching ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {data?.warning && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <Badge variant="warning">Aviso</Badge>
          <p className="mt-2 text-sm text-amber-700">
            A rota respondeu, mas ainda não encontrou uma estrutura completa de eventos no banco.
          </p>
        </Card>
      )}

      {isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar os eventos deste agente.
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
            Total de <strong>{events.length}</strong> eventos para este agente.
          </div>

          <AgentEventsTable events={events} />
        </>
      )}
    </div>
  );
}
