import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className = '' }: FilterBarProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}
      role="search"
      aria-label="Filters"
    >
      {children}
    </div>
  );
}
