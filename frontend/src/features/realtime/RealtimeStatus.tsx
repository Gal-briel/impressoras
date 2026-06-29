import { useRealtime } from './useRealtime';

const statusMap = {
  disabled: {
    label: 'Tempo real inativo',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    dotClassName: 'bg-slate-400',
  },
  connecting: {
    label: 'Conectando...',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  connected: {
    label: 'Tempo real online',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
  reconnecting: {
    label: 'Reconectando...',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  disconnected: {
    label: 'Tempo real offline',
    className: 'border-red-200 bg-red-50 text-red-700',
    dotClassName: 'bg-red-500',
  },
  error: {
    label: 'Erro no tempo real',
    className: 'border-red-200 bg-red-50 text-red-700',
    dotClassName: 'bg-red-500',
  },
};

export function RealtimeStatus() {
  const { status, lastMessageAt } = useRealtime();

  const config = statusMap[status];

  return (
    <div
      className={[
        'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex',
        config.className,
      ].join(' ')}
      title={
        lastMessageAt
          ? `Última atualização: ${lastMessageAt.toLocaleString('pt-BR')}`
          : config.label
      }
    >
      <span
        className={[
          'h-2 w-2 rounded-full',
          status === 'connecting' || status === 'reconnecting'
            ? 'animate-pulse'
            : '',
          config.dotClassName,
        ].join(' ')}
      />

      {config.label}
    </div>
  );
}
