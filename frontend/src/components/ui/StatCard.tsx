import { Card } from './Card';

export function StatCard({ title, value, helper }: { title: string; value: string | number; helper?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[2rem] bg-brand-50 dark:bg-brand-950/40" />
      <div className="relative">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
        {helper && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{helper}</p>}
      </div>
    </Card>
  );
}
