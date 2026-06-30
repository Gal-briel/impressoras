import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone =
  | 'default'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'online'
  | 'offline'
  | 'active'
  | 'inactive'
  | 'approved'
  | 'revoked'
  | 'queued'
  | 'pending'
  | 'dispatched'
  | 'acknowledged'
  | 'executing'
  | 'success'
  | 'failed'
  | 'timed_out'
  | 'error';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone | string | null;
  variant?: BadgeTone | string | null;
};

export function statusTone(status?: string | null): BadgeTone {
  const value = String(status ?? '').toLowerCase();

  if (['online', 'active', 'approved', 'success', 'ok', 'completed'].includes(value)) {
    return 'success';
  }

  if (['queued', 'pending', 'dispatched', 'acknowledged', 'executing', 'warning'].includes(value)) {
    return 'warning';
  }

  if (['offline', 'inactive', 'revoked', 'failed', 'timed_out', 'timeout', 'error'].includes(value)) {
    return 'danger';
  }

  if (['info', 'unknown'].includes(value)) {
    return 'info';
  }

  return 'neutral';
}

function classesForTone(tone?: string | null): string {
  const normalized = statusTone(tone);

  const base =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

  const tones: Record<BadgeTone, string> = {
    default: 'bg-slate-100 text-slate-700',
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    info: 'bg-blue-100 text-blue-700',
    online: 'bg-emerald-100 text-emerald-700',
    offline: 'bg-rose-100 text-rose-700',
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-700',
    approved: 'bg-emerald-100 text-emerald-700',
    revoked: 'bg-rose-100 text-rose-700',
    queued: 'bg-amber-100 text-amber-700',
    pending: 'bg-amber-100 text-amber-700',
    dispatched: 'bg-amber-100 text-amber-700',
    acknowledged: 'bg-amber-100 text-amber-700',
    executing: 'bg-amber-100 text-amber-700',
    failed: 'bg-rose-100 text-rose-700',
    timed_out: 'bg-rose-100 text-rose-700',
    error: 'bg-rose-100 text-rose-700',
  };

  return `${base} ${tones[normalized] ?? tones.neutral}`;
}

export function Badge({
  children,
  tone,
  variant,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`${classesForTone(tone ?? variant)} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
