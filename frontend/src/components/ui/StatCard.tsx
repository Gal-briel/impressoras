import { Card } from './Card';

export function StatCard({ title, value, helper }: { title: string; value: string | number; helper?: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{value}</p>
      {helper && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
    </Card>
  );
}
