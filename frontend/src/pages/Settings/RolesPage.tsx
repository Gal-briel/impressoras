import { useQuery } from '@tanstack/react-query';
import { listRoles } from '../../api/adminApi';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';

export function RolesPage() {
  const rolesQuery = useQuery({ queryKey: ['settings', 'roles'], queryFn: listRoles });
  return (
    <div>
      <PageHeader title="Roles e permissões" description="Papéis RBAC utilizados pelo painel administrativo." />
      {rolesQuery.isLoading && <LoadingState />}
      {rolesQuery.error && <ErrorState error={rolesQuery.error} />}
      {!rolesQuery.isLoading && !rolesQuery.error && (rolesQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhuma role" />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rolesQuery.data?.items.map((role) => (
          <Card key={role.id}>
            <h2 className="text-lg font-semibold">{role.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{role.description ?? 'Sem descrição'}</p>
            <div className="mt-4 flex flex-wrap gap-2">{role.permissions.map((permission) => <Badge key={permission}>{permission}</Badge>)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
