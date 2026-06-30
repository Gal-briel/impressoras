import type { ReactNode } from 'react';

export type StatCardProps = {
  title: string;
  value: ReactNode;
  helper?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function StatCard({
  title,
  value,
  helper,
  description,
  icon,
  className = '',
  children,
}: StatCardProps) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          {(helper || description) && (
            <p className="mt-2 text-sm text-slate-500">{helper ?? description}</p>
          )}
        </div>

        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            {icon}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

export default StatCard;
