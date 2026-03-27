import type { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function DetailRow({ label, value, className = '' }: DetailRowProps) {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className={`flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:gap-4 ${className}`}>
      <span className="text-sm text-text-secondary sm:min-w-[140px]">{label}</span>
      <span className="text-sm text-text-primary">
        {isEmpty ? <span className="text-text-muted">&mdash;</span> : value}
      </span>
    </div>
  );
}
