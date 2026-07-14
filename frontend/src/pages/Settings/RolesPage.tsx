import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermission,
  AdminRole,
  createRole,
  listPermissions,
  listRoles,
  updateRole,
} from '../../api/adminApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';

type RoleEditState = {
  name: string;
  description: string;
  permissions: string[];
};

const AREA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  agents: 'Agentes',
  printers: 'Impressoras',
  commands: 'Comandos',
  inventory: 'Inventário',
  notifications: 'Notificações',
  'operational-alerts': 'Alertas operacionais',
  reports: 'Relatórios',
  audit: 'Auditoria',
  settings: 'Configurações',
  users: 'Usuários e permissões',
  'agent-groups': 'Grupos de agentes',
  'agent-tags': 'Tags de agentes',
};

const ACTION_LABELS: Record<string, string> = {
  read: 'Visualizar',
  write: 'Gerenciar',
  execute: 'Executar',
  export: 'Exportar',
  manage: 'Administrar',
};

function normalizePermission(permission: string) {
  return permission.replace('.', ':');
}

function permissionLabel(permission: AdminPermission) {
  const area = AREA_LABELS[permission.area] ?? permission.area;
  const action = ACTION_LABELS[permission.action] ?? permission.action;

  return action ? `${area} — ${action}` : area;
}

function groupPermissions(permissions: AdminPermission[]) {
  const unique = new Map<string, AdminPermission>();

  for (const permission of permissions) {
    const normalized = normalizePermission(permission.name);

    if (!unique.has(normalized)) {
      unique.set(normalized, {
        ...permission,
        name: normalized,
        area: normalized.split(':')[0] ?? permission.area,
        action: normalized.split(':')[1] ?? permission.action,
      });
    }
  }

  const grouped = Array.from(unique.values()).reduce<Record<string, AdminPermission[]>>((acc, permission) => {
    const area = permission.area || 'outros';
    acc[area] = acc[area] || [];
    acc[area].push(permission);
    return acc;
  }, {});

  for (const area of Object.keys(grouped)) {
    grouped[area].sort((a, b) => permissionLabel(a).localeCompare(permissionLabel(b)));
  }

  return Object.entries(grouped).sort(([a], [b]) => {
    const labelA = AREA_LABELS[a] ?? a;
    const labelB = AREA_LABELS[b] ?? b;
    return labelA.localeCompare(labelB);
  });
}

function hasPermission(selected: string[], permission: string) {
  const normalized = normalizePermission(permission);
  return selected.map(normalizePermission).includes(normalized);
}

function togglePermission(selected: string[], permission: string) {
  const normalized = normalizePermission(permission);

  if (hasPermission(selected, normalized)) {
    return selected.filter((item) => normalizePermission(item) !== normalized);
  }

  return [...selected, normalized].sort();
}

function permissionsSummary(role: AdminRole) {
  const normalized = role.permissions.map(normalizePermission);
  return Array.from(new Set(normalized)).sort();
}

export function RolesPage() {
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({ queryKey: ['settings', 'roles'], queryFn: listRoles });
  const permissionsQuery = useQuery({ queryKey: ['settings', 'permissions'], queryFn: listPermissions });

  const [createState, setCreateState] = useState<RoleEditState>({
    name: '',
    description: '',
    permissions: [],
  });

  const [editing, setEditing] = useState<Record<string, RoleEditState>>({});

  const permissionGroups = useMemo(
    () => groupPermissions(permissionsQuery.data?.items ?? []),
    [permissionsQuery.data?.items],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createRole({
        name: createState.name,
        description: createState.description,
        permissions: createState.permissions,
      }),
    onSuccess: () => {
      setCreateState({ name: '', description: '', permissions: [] });
      void queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: RoleEditState }) =>
      updateRole(roleId, {
        name: payload.name,
        description: payload.description,
        permissions: payload.permissions,
      }),
    onSuccess: () => {
      setEditing({});
      void queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });
    },
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  function startEdit(role: AdminRole) {
    setEditing((current) => ({
      ...current,
      [role.id]: {
        name: role.name,
        description: role.description ?? '',
        permissions: permissionsSummary(role),
      },
    }));
  }

  function cancelEdit(roleId: string) {
    setEditing((current) => {
      const next = { ...current };
      delete next[roleId];
      return next;
    });
  }

  function saveEdit(roleId: string) {
    const state = editing[roleId];
    if (!state) return;

    updateMutation.mutate({ roleId, payload: state });
  }

  function updateEdit(roleId: string, field: keyof RoleEditState, value: string | string[]) {
    setEditing((current) => ({
      ...current,
      [roleId]: {
        ...current[roleId],
        [field]: value,
      },
    }));
  }

  function updateCreate(field: keyof RoleEditState, value: string | string[]) {
    setCreateState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function renderPermissionCheckboxes(
    selected: string[],
    onChange: (next: string[]) => void,
  ) {
    if (permissionsQuery.isLoading) {
      return <p className="text-sm text-slate-500">Carregando permissões...</p>;
    }

    if (permissionsQuery.error) {
      return <ErrorState error={permissionsQuery.error} />;
    }

    return (
      <div className="grid gap-5 xl:grid-cols-2">
        {permissionGroups.map(([area, permissions]) => (
          <div key={area} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-900">{AREA_LABELS[area] ?? area}</h3>

            <div className="mt-4 space-y-3">
              {permissions.map((permission) => {
                const checked = hasPermission(selected, permission.name);

                return (
                  <label key={permission.name} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange(togglePermission(selected, permission.name))}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="font-medium">{permissionLabel(permission)}</span>
                      <span className="ml-2 text-xs text-slate-400">{permission.name}</span>
                      {permission.description ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{permission.description}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles e permissões"
        description="Crie perfis de acesso e defina quais áreas cada usuário poderá acessar."
      />

      <Card className="mb-6 p-5">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr_auto]">
            <input
              value={createState.name}
              onChange={(event) => updateCreate('name', event.target.value)}
              placeholder="Nome do perfil"
              required
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />

            <input
              value={createState.description}
              onChange={(event) => updateCreate('description', event.target.value)}
              placeholder="Descrição"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />

            <Button type="submit" disabled={createMutation.isPending || !createState.name.trim()}>
              Criar perfil
            </Button>
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Definir áreas de acesso do novo perfil
            </summary>

            <div className="mt-4">
              {renderPermissionCheckboxes(createState.permissions, (next) => updateCreate('permissions', next))}
            </div>
          </details>

          {createMutation.error ? <ErrorState error={createMutation.error} /> : null}
        </form>
      </Card>

      {rolesQuery.isLoading && <LoadingState />}
      {rolesQuery.error && <ErrorState error={rolesQuery.error} />}
      {!rolesQuery.isLoading && !rolesQuery.error && (rolesQuery.data?.items.length ?? 0) === 0 && (
        <EmptyState title="Nenhuma role" />
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {rolesQuery.data?.items.map((role) => {
          const edit = editing[role.id];
          const normalizedPermissions = permissionsSummary(role);

          return (
            <Card key={role.id} className="p-5">
              {!edit ? (
                <>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-lg font-semibold">{role.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">{role.description ?? 'Sem descrição'}</p>
                    </div>

                    <Button variant="secondary" onClick={() => startEdit(role)}>
                      Editar perfil
                    </Button>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {normalizedPermissions.map((permission) => (
                      <Badge key={permission}>{permission}</Badge>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
                    <label className="text-sm font-medium text-slate-700">
                      Nome
                      <input
                        value={edit.name}
                        onChange={(event) => updateEdit(role.id, 'name', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Descrição
                      <input
                        value={edit.description}
                        onChange={(event) => updateEdit(role.id, 'description', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>
                  </div>

                  {renderPermissionCheckboxes(edit.permissions, (next) => updateEdit(role.id, 'permissions', next))}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" disabled={updateMutation.isPending} onClick={() => cancelEdit(role.id)}>
                      Cancelar
                    </Button>
                    <Button disabled={updateMutation.isPending || !edit.name.trim()} onClick={() => saveEdit(role.id)}>
                      Salvar perfil
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {updateMutation.error ? (
        <div className="mt-4">
          <ErrorState error={updateMutation.error} />
        </div>
      ) : null}
    </div>
  );
}
