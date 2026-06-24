import { useQuery } from '@tanstack/react-query';
import { listTenants } from '../../api/adminApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDateTime } from '../../utils/date';

export function TenantsPage() {
  const tenantsQuery = useQuery({ queryKey: ['settings', 'tenants'], queryFn: listTenants });
  return (
    <div>
      <PageHeader title="Tenants" description="Clientes/empresas disponíveis na plataforma multi-tenant." />
      {tenantsQuery.isLoading && <LoadingState />}
      {tenantsQuery.error && <ErrorState error={tenantsQuery.error} />}
      {!tenantsQuery.isLoading && !tenantsQuery.error && (tenantsQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhum tenant" />}
      <div className="space-y-3">
        {tenantsQuery.data?.items.map((tenant) => (
          <Card key={tenant.id}>
            <div className="flex items-center justify-between"><div><p className="font-semibold">{tenant.name}</p><p className="text-sm text-slate-500">{tenant.id} • {formatDateTime(tenant.created_at)}</p></div><Badge tone={statusTone(tenant.active ? 'active' : 'inactive')}>{tenant.active ? 'active' : 'inactive'}</Badge></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
