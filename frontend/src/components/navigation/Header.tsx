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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:px-8">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="font-semibold text-slate-950 dark:text-white lg:hidden">Gabriel</Link>
        <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline">Tenant: {user?.tenant?.name ?? user?.tenant_id ?? '-'}</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{user?.email}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role.name}</p>
        </div>
        <Button variant="secondary" onClick={handleLogout}>Sair</Button>
      </div>
    </header>
  );
}
