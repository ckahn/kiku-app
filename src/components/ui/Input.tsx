import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted bg-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${error ? 'border-error-subtle' : 'border-border'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-error-on-subtle">{error}</p>}
    </div>
  );
}
