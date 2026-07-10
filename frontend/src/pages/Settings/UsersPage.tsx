import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, listRoles, listUsers, updateUser } from '../../api/adminApi';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';

type EditState = {
  email: string;
  role_id: string;
  status: string;
  password: string;
};

type UpdatePayload = {
  email?: string;
  role_id?: string;
  status?: string;
  password?: string;
};

export function UsersPage() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['settings', 'users'], queryFn: listUsers });
  const rolesQuery = useQuery({ queryKey: ['settings', 'roles'], queryFn: listRoles });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [editing, setEditing] = useState<Record<string, EditState>>({});

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
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePayload }) => updateUser(id, payload),
    onSuccess: () => {
      setEditing({});
      void queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  function startEdit(user: any) {
    setEditing((current) => ({
      ...current,
      [user.id]: {
        email: user.email,
        role_id: user.role_id,
        status: user.status,
        password: '',
      },
    }));
  }

  function cancelEdit(userId: string) {
    setEditing((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  function updateEdit(userId: string, field: keyof EditState, value: string) {
    setEditing((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
      },
    }));
  }

  function saveEdit(userId: string) {
    const edit = editing[userId];
    if (!edit) return;

    const payload: UpdatePayload = {
      email: edit.email,
      role_id: edit.role_id,
      status: edit.status,
    };

    if (edit.password.trim()) {
      payload.password = edit.password.trim();
    }

    updateMutation.mutate({ id: userId, payload });
  }

  function toggleStatus(user: any) {
    updateMutation.mutate({
      id: user.id,
      payload: {
        status: user.status === 'active' ? 'inactive' : 'active',
      },
    });
  }

  return (
    <div>
      <PageHeader title="Usuários" description="Criação, edição, troca de perfil, reset de senha e desativação de contas." />

      <Card className="mb-6 p-5">
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="email@empresa.com"
            required
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />

          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Senha inicial"
            required
            minLength={6}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />

          <select
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            required
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">Role</option>
            {rolesQuery.data?.items.map((role: any) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          <Button type="submit" disabled={createMutation.isPending || rolesQuery.isLoading}>
            Criar
          </Button>
        </form>

        {createMutation.error && (
          <div className="mt-3">
            <ErrorState error={createMutation.error} />
          </div>
        )}
      </Card>

      {usersQuery.isLoading && <LoadingState />}
      {usersQuery.error && <ErrorState error={usersQuery.error} />}
      {!usersQuery.isLoading && !usersQuery.error && (usersQuery.data?.items.length ?? 0) === 0 && (
        <EmptyState title="Nenhum usuário" />
      )}

      <div className="space-y-3">
        {usersQuery.data?.items.map((user: any) => {
          const edit = editing[user.id];

          return (
            <Card key={user.id} className="p-5">
              {!edit ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{user.email}</p>
                    <p className="text-sm text-slate-500">{user.role_name ?? user.role_id}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(user.status)}>{user.status}</Badge>

                    <Button variant="secondary" disabled={updateMutation.isPending} onClick={() => startEdit(user)}>
                      Editar
                    </Button>

                    <Button variant="secondary" disabled={updateMutation.isPending} onClick={() => toggleStatus(user)}>
                      {user.status === 'active' ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_180px_1fr]">
                    <label className="text-sm font-medium text-slate-700">
                      E-mail
                      <input
                        value={edit.email}
                        onChange={(event) => updateEdit(user.id, 'email', event.target.value)}
                        type="email"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Perfil
                      <select
                        value={edit.role_id}
                        onChange={(event) => updateEdit(user.id, 'role_id', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        {rolesQuery.data?.items.map((role: any) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Status
                      <select
                        value={edit.status}
                        onChange={(event) => updateEdit(user.id, 'status', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Nova senha opcional
                      <input
                        value={edit.password}
                        onChange={(event) => updateEdit(user.id, 'password', event.target.value)}
                        type="password"
                        minLength={6}
                        placeholder="Deixe vazio para manter"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" disabled={updateMutation.isPending} onClick={() => cancelEdit(user.id)}>
                      Cancelar
                    </Button>
                    <Button disabled={updateMutation.isPending} onClick={() => saveEdit(user.id)}>
                      Salvar alterações
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {updateMutation.error && (
        <div className="mt-4">
          <ErrorState error={updateMutation.error} />
        </div>
      )}
    </div>
  );
}
