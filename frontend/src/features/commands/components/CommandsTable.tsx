import { Card } from '../../../components/ui/Card';
import type { Command } from '../types';
import { CommandStatusBadge } from './CommandStatusBadge';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getCommandType(command: Command) {
  return command.command_type || command.type || '-';
}

type CommandsTableProps = {
  commands: Command[];
};

export function CommandsTable({ commands }: CommandsTableProps) {
  if (commands.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-950">
          Nenhum comando encontrado
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Quando comandos forem criados, eles aparecerão aqui.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Comando
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Agente
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Criado em
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Finalizado em
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Erro
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {commands.map((command) => (
              <tr key={command.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-950">{getCommandType(command)}</p>
                  <p className="mt-1 text-xs text-slate-500">{command.id}</p>
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {command.agent_id || '-'}
                </td>

                <td className="px-5 py-4">
                  <CommandStatusBadge command={command} />
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {formatDate(command.created_at)}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {formatDate(command.finished_at)}
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {command.error_message || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
