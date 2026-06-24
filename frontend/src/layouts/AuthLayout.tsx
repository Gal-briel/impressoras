import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600">Gabriel</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Acesso operacional</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Entre com sua conta para gerenciar agentes, impressoras e comandos.</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
