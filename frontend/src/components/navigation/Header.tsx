import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

type HeaderProps = {
  onLogout?: () => void;
};

export function Header({ onLogout }: HeaderProps) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  function handleLogout() {
    clearSession();
    onLogout?.();

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');

    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center justify-end gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">
            {user?.email ?? 'Usuário'}
          </p>
          <p className="text-xs text-slate-500">
            {user?.role?.name ?? 'Sem perfil'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
