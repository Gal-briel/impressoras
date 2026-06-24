import { Outlet } from 'react-router-dom';

const highlights = [
  'Controle remoto de agentes',
  'Inventário de impressoras',
  'Comandos com auditoria',
];

export function AuthLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.35),transparent_32rem),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.22),transparent_28rem)]" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-blue-100 shadow-soft backdrop-blur">
            Plataforma Gabriel • Operação multi-tenant
          </div>
          <h1 className="max-w-xl text-5xl font-bold tracking-tight text-white">
            Gestão remota de computadores e impressoras com segurança operacional.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Centralize agentes, comandos, auditoria e inventário em uma interface pronta para escalar entre clientes.
          </p>

          <div className="mt-8 grid max-w-xl gap-3">
            {highlights.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/20 text-brand-100">✓</span>
                <span className="text-sm font-medium text-slate-100">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="rounded-[2rem] border border-white/10 bg-white p-8 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-white">
            <div className="mb-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-glow">
                G
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-200">Gabriel</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">Acesso operacional</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Entre com sua conta para acessar o painel administrativo.
              </p>
            </div>
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
}
