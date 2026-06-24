import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, listRoles, listUsers, updateUser } from '../../api/adminApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';

export function UsersPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['settings', 'users'], queryFn: listUsers });
  const rolesQuery = useQuery({ queryKey: ['settings', 'roles'], queryFn: listRoles });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');

  const createMutation = useMutation({
    mutationFn: () => createUser({ email, password, role_id: roleId }),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      setRoleId('');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateUser(id, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'users'] }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div>
      <PageHeader title="Usuários" description="Criação, edição básica e desativação de contas." />
      <Card className="mb-6">
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="email@empresa.com" required className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Senha inicial" required className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} required className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Role</option>
            {rolesQuery.data?.items.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <Button type="submit" disabled={createMutation.isPending}>Criar</Button>
        </form>
        {createMutation.error && <div className="mt-3"><ErrorState error={createMutation.error} /></div>}
      </Card>
      {usersQuery.isLoading && <LoadingState />}
      {usersQuery.error && <ErrorState error={usersQuery.error} />}
      {!usersQuery.isLoading && !usersQuery.error && (usersQuery.data?.items.length ?? 0) === 0 && <EmptyState title="Nenhum usuário" />}
      <div className="space-y-3">
        {usersQuery.data?.items.map((user) => (
          <Card key={user.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{user.email}</p><p className="text-sm text-slate-500">{user.role_name ?? user.role_id}</p></div>
              <div className="flex items-center gap-2"><Badge tone={statusTone(user.status)}>{user.status}</Badge><Button variant="secondary" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ id: user.id, status: user.status === 'active' ? 'inactive' : 'active' })}>{user.status === 'active' ? 'Desativar' : 'Ativar'}</Button></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
