import type { ReactNode } from 'react';

export type BadgeTone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

const tones: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-900',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status?: string | null): BadgeTone {
  const normalized = String(status ?? '').toLowerCase();

  if (['online', 'success', 'approved', 'active', 'finished'].includes(normalized)) return 'green';
  if (['queued', 'pending', 'dispatched', 'acknowledged', 'executing'].includes(normalized)) return 'blue';
  if (['warning', 'timedout', 'expired', 'offline'].includes(normalized)) return 'amber';
  if (['failed', 'error', 'revoked', 'inactive'].includes(normalized)) return 'red';
  return 'slate';
}
