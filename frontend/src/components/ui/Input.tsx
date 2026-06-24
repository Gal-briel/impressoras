import type { InputHTMLAttributes, ReactNode } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: ReactNode;
};

export function Input({ label, helperText, error, leftIcon, className = '', id, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{leftIcon}</div>}
        <input
          id={inputId}
          className={`focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 ${leftIcon ? 'pl-10' : ''} ${error ? 'border-red-300 focus:ring-red-500 dark:border-red-800' : ''} ${className}`}
          {...props}
        />
      </div>
      {helperText && !error && <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}
      {error && <p className="text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
    </div>
  );
}
