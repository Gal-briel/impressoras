import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';
import { logout } from '../../api/authApi';

export function Header() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 lg:px-8">
      <div className="flex h-20 items-center justify-between">
        <div className="min-w-0">
          <Link to="/dashboard" className="flex items-center gap-3 font-bold text-slate-950 dark:text-white lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-white">G</span>
            Gabriel
          </Link>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Painel Administrativo</p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              Tenant: {user?.tenant?.name ?? user?.tenant_id ?? '-'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-right shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:block">
            <p className="max-w-48 truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.email}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role.name}</p>
          </div>
          <Button variant="secondary" onClick={handleLogout}>Sair</Button>
        </div>
      </div>
    </header>
  );
}
