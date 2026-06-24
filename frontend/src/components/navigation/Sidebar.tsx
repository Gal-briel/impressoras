import { NavLink } from 'react-router-dom';
import type { Permission } from '../../types/rbac';
import { useAuthStore } from '../../stores/authStore';

const navItems: Array<{ to: string; label: string; permission?: Permission }> = [
  { to: '/dashboard', label: 'Dashboard', permission: 'agents.read' },
  { to: '/agents', label: 'Agentes', permission: 'agents.read' },
  { to: '/printers', label: 'Impressoras', permission: 'printers.read' },
  { to: '/commands', label: 'Comandos', permission: 'commands.execute' },
  { to: '/audit', label: 'Auditoria', permission: 'audit.read' },
  { to: '/settings', label: 'Administração', permission: 'settings.read' },
];

export function Sidebar() {
  const can = useAuthStore((state) => state.can);
  return (
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-slate-950 text-white dark:border-slate-800 lg:block">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div>
          <p className="text-lg font-semibold">Gabriel</p>
          <p className="text-xs text-slate-400">Gestão remota</p>
        </div>
      </div>
      <nav className="space-y-1 p-4">
        {navItems.filter((item) => can(item.permission)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
