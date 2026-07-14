import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Card } from '../../../components/ui/Card';
import {
  assignAgentGroup,
  createAgentGroup,
  listAgentGroups,
} from '../api/agentsApi';
import type { Agent } from '../types';

function groupingStatusLabel(agent: Agent) {
  if (agent.grouping_status === 'manual') {
    return 'Classificação manual';
  }

  if (agent.grouping_status === 'auto') {
    return 'Classificação automática por domínio';
  }

  if (agent.grouping_status === 'requires_review') {
    return 'Revisar empresa/grupo';
  }

  return agent.grouping_status || '-';
}

export function AgentGroupAssignmentSection({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState(agent.group_id || '');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [message, setMessage] = useState('');

  const groupsQuery = useQuery({
    queryKey: ['agent-groups'],
    queryFn: listAgentGroups,
  });

  const groups = groupsQuery.data?.items || [];

  const selectedGroup = useMemo(() => {
    return groups.find((group) => group.id === selectedGroupId);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    setSelectedGroupId(agent.group_id || '');
  }, [agent.group_id]);

  function invalidateAgentQueries() {
    queryClient.invalidateQueries({ queryKey: ['agents'] });
    queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
    queryClient.invalidateQueries({ queryKey: ['agent-groups'] });
    queryClient.invalidateQueries();
  }

  const assignMutation = useMutation({
    mutationFn: (groupId: string) => assignAgentGroup(agent.id, groupId),
    onSuccess: () => {
      setMessage('Grupo do agente atualizado com sucesso.');
      invalidateAgentQueries();
    },
  });

  const createAndAssignMutation = useMutation({
    mutationFn: async () => {
      const cleanName = newGroupName.trim();

      if (!cleanName) {
        throw new Error('Informe o nome da empresa/grupo.');
      }

      const group = await createAgentGroup({
        name: cleanName,
        description:
          newGroupDescription.trim() ||
          'Grupo criado manualmente pelo detalhe do agente.',
      });

      await assignAgentGroup(agent.id, group.id);

      return group;
    },
    onSuccess: (group) => {
      setSelectedGroupId(group.id);
      setNewGroupName('');
      setNewGroupDescription('');
      setMessage('Empresa/grupo criado e atribuído ao agente.');
      invalidateAgentQueries();
    },
  });

  function handleAssignExisting(event: FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!selectedGroupId) {
      setMessage('Selecione uma empresa/grupo.');
      return;
    }

    assignMutation.mutate(selectedGroupId);
  }

  function handleCreateAndAssign(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    createAndAssignMutation.mutate();
  }

  const isSaving = assignMutation.isPending || createAndAssignMutation.isPending;
  const error = assignMutation.error || createAndAssignMutation.error;

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Empresa / Grupo do agente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Use esta área para classificar agentes sem domínio ou mover uma máquina para outra empresa.
          </p>
        </div>

        <span
          className={
            agent.grouping_status === 'requires_review'
              ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800'
              : 'rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800'
          }
        >
          {groupingStatusLabel(agent)}
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Grupo atual</p>
        <p className="mt-1 text-base font-bold text-slate-950">
          {agent.group_name || 'Sem grupo'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {agent.domain_name
            ? `Domínio detectado: ${agent.domain_name}`
            : 'Nenhum domínio detectado no hostname.'}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <form
          onSubmit={handleAssignExisting}
          className="rounded-xl border border-slate-200 p-4"
        >
          <h3 className="font-semibold text-slate-900">
            Adicionar a um grupo existente
          </h3>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Empresa/grupo
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Selecione um grupo</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          {selectedGroup ? (
            <p className="mt-2 text-xs text-slate-500">
              {selectedGroup.description || 'Sem descrição.'}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving || groupsQuery.isLoading}
            className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assignMutation.isPending ? 'Salvando...' : 'Salvar grupo'}
          </button>
        </form>

        <form
          onSubmit={handleCreateAndAssign}
          className="rounded-xl border border-slate-200 p-4"
        >
          <h3 className="font-semibold text-slate-900">
            Criar nova empresa/grupo
          </h3>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Nome
            <input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Ex.: Cliente ABC, matriz.local, financeiro..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            Descrição
            <textarea
              value={newGroupDescription}
              onChange={(event) => setNewGroupDescription(event.target.value)}
              placeholder="Descrição opcional do grupo"
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createAndAssignMutation.isPending
              ? 'Criando...'
              : 'Criar e atribuir'}
          </button>
        </form>
      </div>

      {message ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível atualizar o grupo.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </div>
      ) : null}
    </Card>
  );
}
