import { ReactNode } from 'react';
import { Card } from './Card';

type StatCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
};

export function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {icon && <div className="rounded-xl bg-blue-50 p-3 text-blue-600">{icon}</div>}
      </div>
    </Card>
  );
}
