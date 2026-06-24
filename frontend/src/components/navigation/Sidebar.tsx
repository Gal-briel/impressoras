import { NavLink } from 'react-router-dom';
import type { Permission } from '../../types/rbac';
import { useAuthStore } from '../../stores/authStore';

const navItems: Array<{ to: string; label: string; icon: string; permission?: Permission }> = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌁', permission: 'agents.read' },
  { to: '/agents', label: 'Agentes', icon: '◉', permission: 'agents.read' },
  { to: '/printers', label: 'Impressoras', icon: '▣', permission: 'printers.read' },
  { to: '/commands', label: 'Comandos', icon: '⚡', permission: 'commands.execute' },
  { to: '/audit', label: 'Auditoria', icon: '◎', permission: 'audit.read' },
  { to: '/settings', label: 'Administração', icon: '⚙', permission: 'settings.read' },
];

export function Sidebar() {
  const can = useAuthStore((state) => state.can);
  const visibleItems = navItems.filter((item) => can(item.permission));

  return (
    <aside className="hidden h-screen w-72 shrink-0 border-r border-white/10 bg-slate-950 text-white shadow-2xl lg:sticky lg:top-0 lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-lg font-bold shadow-glow">G</div>
        <div>
          <p className="text-lg font-bold leading-none">Gabriel</p>
          <p className="mt-1 text-xs text-slate-400">Gestão remota</p>
        </div>
      </div>

      <nav className="space-y-2 p-4">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-white text-slate-950 shadow-soft'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-xs group-hover:bg-white/15">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-slate-300">
        <p className="font-semibold text-white">Ambiente seguro</p>
        <p className="mt-1 leading-5">Sessão protegida por JWT, tenant e permissões RBAC.</p>
      </div>
    </aside>
  );
}
