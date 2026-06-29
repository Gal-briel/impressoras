import { useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { PrintersTable } from '../components/PrintersTable';
import { usePrinters } from '../hooks/usePrinters';

export function PrintersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = usePrinters();

  const printers = data?.items || [];

  const filteredPrinters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return printers;
    }

    return printers.filter((printer) => {
      const values = [
        printer.name,
        printer.printer_name,
        printer.driver_name,
        printer.port_name,
        printer.share_name,
        printer.agent_id,
        printer.agent_hostname,
      ];

      return values.some((value) =>
        String(value || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [printers, search]);

  const onlineCount = printers.filter((printer) => printer.is_online === true || printer.status === 'online').length;
  const sharedCount = printers.filter((printer) => printer.is_shared).length;
  const defaultCount = printers.filter((printer) => printer.is_default).length;

  return (
    <section>
      <PageHeader
        title="Impressoras"
        description="Inventário geral de impressoras identificadas pelos agentes."
        actions={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total de impressoras"
          value={printers.length}
          description="Detectadas no ambiente"
          icon="🖨️"
        />

        <StatCard
          title="Online"
          value={onlineCount}
          description="Disponíveis"
          icon="✅"
        />

        <StatCard
          title="Compartilhadas"
          value={sharedCount}
          description="Com share configurado"
          icon="🌐"
        />

        <StatCard
          title="Padrão"
          value={defaultCount}
          description="Definidas como padrão"
          icon="⭐"
        />
      </div>

      {data?.warning && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <Badge variant="warning">Aviso</Badge>
          <p className="mt-2 text-sm text-amber-700">
            O backend respondeu, mas ainda não encontrou uma tabela/modelo real de impressoras.
            A tela já está preparada para quando o agente enviar esse inventário.
          </p>
        </Card>
      )}

      <Card className="mb-4 p-5">
        <div className="max-w-md">
          <Input
            label="Pesquisar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, driver, porta ou agente"
          />
        </div>
      </Card>

      {isError && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar as impressoras.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="h-16 animate-pulse bg-slate-100 p-4">
              <div />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Exibindo <strong>{filteredPrinters.length}</strong> de{' '}
            <strong>{printers.length}</strong> impressoras.
          </div>

          <PrintersTable printers={filteredPrinters} />
        </>
      )}
    </section>
  );
}
