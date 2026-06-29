import { NavLink } from 'react-router-dom';

const items = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Agentes', path: '/agents' },
  { label: 'Inventário', path: '/inventory' },
  { label: 'Comandos em massa', path: '/bulk-commands' },
  { label: 'Histórico de comandos', path: '/command-history' },
  { label: 'Impressoras', path: '/printers' },
  { label: 'Comandos', path: '/commands' },
  { label: 'Auditoria', path: '/audit' },
  { label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:block">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-bold">SP</div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">SaaS Platform</h2>
            <p className="text-xs text-slate-400">Remote Management</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              [
                'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
