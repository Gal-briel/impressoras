import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Falha no login');
      }

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token || '');
      localStorage.setItem('user', JSON.stringify(data.user || null));

      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden px-12 py-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.35),_transparent_35rem)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-sm font-bold shadow-lg shadow-blue-900/30">
                SP
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-blue-200">
                  SaaS Platform
                </p>
                <p className="text-sm text-slate-400">Hub-and-Spoke Management</p>
              </div>
            </div>
          </div>

          <div className="relative max-w-xl">
            <p className="mb-4 inline-flex rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">
              Plataforma de gerenciamento remoto
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-white">
              Controle agentes, comandos e impressoras com segurança.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Interface preparada para operação multi-tenant, RBAC, auditoria e atualizações em tempo real.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="block text-white">JWT</strong>
              Sessão segura
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="block text-white">RBAC</strong>
              Permissões
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="block text-white">Realtime</strong>
              WebSocket
            </div>
          </div>
        </section>

        <section className="grid place-items-center bg-slate-50 px-6 py-10 text-slate-950">
          <Card className="w-full max-w-md p-8">
            <div className="mb-8">
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-200">
                SP
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                Entrar no painel
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Use suas credenciais para acessar a operação.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
              />

              <Input
                label="Senha"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar no painel'}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              Ambiente de desenvolvimento: admin@example.com / admin123
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
