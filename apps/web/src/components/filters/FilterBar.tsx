import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
  loading?: boolean;
}

export function FilterBar({ children, className = '', loading = false }: FilterBarProps) {
  return (
    <div
      className={`mb-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 ${className}`}
      role="search"
      aria-label="Filters"
    >
      {children}
      {loading && (
        <div className="flex items-center" data-testid="filter-loading-spinner">
          <i
            className="mdi mdi-loading mdi-spin text-[16px] text-text-secondary"
            aria-label="Loading filters"
          />
        </div>
      )}
    </div>
  );
}
