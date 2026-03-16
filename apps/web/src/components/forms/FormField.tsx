import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  error,
  hint,
  htmlFor,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-text-secondary"
      >
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
