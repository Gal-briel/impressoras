import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const items = [
  { to: '/settings/users', title: 'Usuários', description: 'Criar, editar e desativar usuários do tenant.' },
  { to: '/settings/roles', title: 'Perfis e áreas de acesso', description: 'Criar perfis, editar permissões e controlar quais áreas cada usuário acessa.' },
];

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Administração" description="Gerencie usuários, perfis e áreas de acesso da plataforma." />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-brand-500">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
