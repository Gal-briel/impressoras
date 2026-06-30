import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helperText?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id ?? props.name ?? label;

    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          {label}
        </span>

        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`}
          {...props}
        />

        {helperText && !error && (
          <span className="mt-1 block text-xs text-slate-500">
            {helperText}
          </span>
        )}

        {error && (
          <span className="mt-1 block text-xs text-rose-600">
            {error}
          </span>
        )}
      </label>
    );
  },
);

Input.displayName = 'Input';

export default Input;
