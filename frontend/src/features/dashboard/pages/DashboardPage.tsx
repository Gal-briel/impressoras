import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { SecurityAlertsDashboardCard } from '../components/SecurityAlertsDashboardCard';
import { SoftwareChangesDashboardCard } from '../components/SoftwareChangesDashboardCard';
import { OperationalAlertsDashboardCard } from '../components/OperationalAlertsDashboardCard';
import { NotificationsDashboardCard } from '../components/NotificationsDashboardCard';

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardSummary();

  return (
    <section>
      <PageHeader
        title="Dashboard"
        description="Visão inicial da operação de agentes, comandos e organização."
        actions={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      {isError && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar o resumo do dashboard.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-32 animate-pulse bg-slate-100 p-5">\n              <div />\n            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Agentes totais"
            value={data?.totalAgents ?? 0}
            description="Agentes cadastrados no tenant atual"
            icon="🖥️"
          />

          <StatCard
            title="Agentes online"
            value={data?.onlineAgents ?? 0}
            description="Com check-in recente"
            icon="🟢"
          />

          <StatCard
            title="Offline ou revogados"
            value={data?.offlineOrRevokedAgents ?? 0}
            description="Sem check-in recente ou bloqueados"
            icon="🔴"
          />

          <StatCard
            title="Comandos pendentes"
            value={data?.pendingCommands ?? 0}
            description="Na fila ou em execução"
            icon="⚙️"
          />

          <StatCard
            title="Tags cadastradas"
            value={data?.totalTags ?? 0}
            description="Classificações disponíveis"
            icon="🏷️"
          />

          <StatCard
            title="Grupos cadastrados"
            value={data?.totalGroups ?? 0}
            description="Agrupamentos operacionais"
            icon="📁"
          />
        </div>
      )}

      <div className="mt-8">
        <OperationalAlertsDashboardCard />
        <NotificationsDashboardCard />
      </div>

      <div className="mt-8">
        <SecurityAlertsDashboardCard />
      </div>

      <div className="mt-8">
        <SoftwareChangesDashboardCard />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
      </div>
    </section>
  );
}
