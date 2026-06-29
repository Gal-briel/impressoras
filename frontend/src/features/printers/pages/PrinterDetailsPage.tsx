import { Link, useParams } from 'react-router-dom';

import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PrinterInfoCard } from '../components/PrinterInfoCard';
import { usePrinter } from '../hooks/usePrinter';

export function PrinterDetailsPage() {
  const { id } = useParams();

  const {
    data: printer,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = usePrinter(id);

  return (
    <section>
      <PageHeader
        title="Detalhes da Impressora"
        description="Informações completas da impressora inventariada."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/printers"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Voltar
            </Link>

            <button
              onClick={() => refetch()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {isFetching ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        }
      />

      {isLoading && (
        <Card className="h-64 animate-pulse bg-slate-100 p-6">
          <div />
        </Card>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-700">
            Não foi possível carregar os detalhes da impressora.
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </pre>
        </Card>
      )}

      {!isLoading && !isError && printer && (
        <PrinterInfoCard printer={printer} />
      )}
    </section>
  );
}
