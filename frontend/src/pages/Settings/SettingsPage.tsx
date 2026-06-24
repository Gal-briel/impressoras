import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const items = [
  { to: '/settings/users', title: 'Usuários', description: 'Criar, editar e desativar usuários do tenant.' },
  { to: '/settings/roles', title: 'Roles e permissões', description: 'Owner, Admin, Technician, ReadOnly e Auditor.' },
  { to: '/settings/tenants', title: 'Tenants', description: 'Visão administrativa dos clientes/empresas.' },
];

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Administração" description="Configurações administrativas da plataforma." />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:border-brand-500">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
