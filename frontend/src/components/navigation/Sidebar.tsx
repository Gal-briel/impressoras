import { NavLink } from 'react-router-dom';

import { useNotificationsSummary } from '../../features/notifications/hooks/usePersistentNotifications';
import { useAuthStore } from '../../stores/authStore';
import type { Permission } from '../../types/rbac';

type SidebarItem = {
  label: string;
  path: string;
  requiredPermission?: Permission | Permission[];
};

const items: SidebarItem[] = [
  { label: 'Dashboard', path: '/dashboard', requiredPermission: 'dashboard:read' },
  { label: 'Alertas', path: '/security-alerts', requiredPermission: 'inventory:read' },
  { label: 'Alertas Op.', path: '/operational-alerts', requiredPermission: 'operational-alerts:read' },
  { label: 'Notificações', path: '/notifications', requiredPermission: 'notifications:read' },
  { label: 'Relatórios', path: '/reports', requiredPermission: 'reports:read' },
  { label: 'Mudanças SW', path: '/software-changes', requiredPermission: 'inventory:read' },
  { label: 'Agentes', path: '/agents', requiredPermission: 'agents:read' },
  { label: 'Inventário', path: '/inventory', requiredPermission: 'inventory:read' },
  { label: 'Comandos em massa', path: '/bulk-commands', requiredPermission: 'commands:execute' },
  { label: 'Histórico de comandos', path: '/command-history', requiredPermission: 'commands:read' },
  { label: 'Impressoras', path: '/printers', requiredPermission: 'printers:read' },
  { label: 'Comandos', path: '/commands', requiredPermission: 'commands:read' },
  { label: 'Auditoria', path: '/audit', requiredPermission: 'audit:read' },
  { label: 'Configurações', path: '/settings', requiredPermission: 'settings:read' },
];

function NotificationsBadge() {
  const notificationsSummaryQuery = useNotificationsSummary();
  const unreadNotifications = notificationsSummaryQuery.data?.summary.unread_total ?? 0;

  if (unreadNotifications <= 0) {
    return null;
  }

  return (
    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      {unreadNotifications}
    </span>
  );
}

export function Sidebar() {
  const can = useAuthStore((state) => state.can);
  const visibleItems = items.filter((item) => can(item.requiredPermission));

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:block">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-bold">
            GB
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Gabriel
            </h2>
            <p className="text-xs text-slate-400">Gestão de agentes</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              [
                'flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white',
              ].join(' ')
            }
          >
            <span>{item.label}</span>

            {item.path === '/notifications' ? <NotificationsBadge /> : null}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
