import { Button } from '../ui/Button';
import { RealtimeStatus } from '../../features/realtime/RealtimeStatus';

type HeaderProps = {
  onLogout: () => void;
};

export function Header({ onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-6">
        <div>
          <p className="text-sm font-semibold text-slate-900">Painel Administrativo</p>
          <p className="text-xs text-slate-500">Gerenciamento remoto de agentes e impressoras</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">admin@example.com</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
          <Button variant="secondary" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </div>
          <RealtimeStatus />
    </header>
  );
}
