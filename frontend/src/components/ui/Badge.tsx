const toneClasses: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-800 dark:text-slate-200',
};

export function Badge({ children, tone = 'slate' }: { children: string; tone?: keyof typeof toneClasses }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}>{children}</span>;
}

export function statusTone(status?: string): keyof typeof toneClasses {
  const normalized = status?.toLowerCase();
  if (['online', 'success', 'approved', 'active'].includes(normalized ?? '')) return 'green';
  if (['queued', 'pending', 'executing', 'acknowledged', 'dispatched', 'warning'].includes(normalized ?? '')) return 'yellow';
  if (['offline', 'failed', 'revoked', 'blocked', 'error', 'critical'].includes(normalized ?? '')) return 'red';
  if (['info'].includes(normalized ?? '')) return 'blue';
  return 'slate';
}
