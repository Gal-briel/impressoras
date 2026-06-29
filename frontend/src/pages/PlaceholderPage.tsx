import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section>
      <PageHeader
        title={title}
        description="Estrutura preparada para implementação do módulo nas próximas sprints."
      />

      <Card className="p-8">
        <div className="max-w-2xl">
          <Badge variant="info">Módulo preparado</Badge>
          <h2 className="mt-4 text-xl font-semibold text-slate-950">
            Base visual e estrutural criada
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Esta página já utiliza o layout principal, sidebar, header e componentes reutilizáveis.
            A implementação de negócio será adicionada sem retrabalho visual.
          </p>
        </div>
      </Card>
    </section>
  );
}
