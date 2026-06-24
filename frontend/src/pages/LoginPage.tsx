import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/authApi';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../api/httpClient';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await login({ email, password, tenant_id: tenantId || undefined });
      setSession(response.user, response.access_token, response.refresh_token);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">E-mail</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Senha</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tenant ID opcional</label>
        <input
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          placeholder="Use somente se houver múltiplos tenants com mesmo e-mail"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
      </div>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Entrando...' : 'Entrar'}</Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Ambiente dev: admin@example.com / admin123</p>
    </form>
  );
}
