import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/authApi';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="E-mail"
        name="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        placeholder="seu.email@empresa.com"
        autoComplete="email"
        required
      />

      <Input
        label="Senha"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        placeholder="Digite sua senha"
        autoComplete="current-password"
        required
      />

      <Input
        label="Tenant ID opcional"
        name="tenantId"
        value={tenantId}
        onChange={(event) => setTenantId(event.target.value)}
        placeholder="Use somente se houver múltiplos tenants"
        helperText="Normalmente este campo fica em branco."
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando...' : 'Entrar no painel'}
      </Button>

      <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Ambiente dev: <strong>admin@example.com</strong> / <strong>admin123</strong>
      </div>
    </form>
  );
}
