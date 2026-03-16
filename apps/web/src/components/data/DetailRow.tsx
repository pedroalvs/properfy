import type { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function DetailRow({ label, value, className = '' }: DetailRowProps) {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className={`flex items-start gap-4 py-1.5 ${className}`}>
      <span className="min-w-[140px] text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary">
        {isEmpty ? <span className="text-text-muted">&mdash;</span> : value}
      </span>
    </div>
  );
}
