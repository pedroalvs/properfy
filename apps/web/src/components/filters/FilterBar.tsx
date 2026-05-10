import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
  loading?: boolean;
  /**
   * Callback fired when the user clicks the "Clear filters" affordance.
   * The button only renders when this prop is provided AND `hasActiveFilters`
   * is `true` — that way each filter container drives its own visibility
   * (the bar doesn't try to know what "active" means for arbitrary filter
   * widgets). Owners pass `() => onFiltersChange(DEFAULT_FILTERS)` from
   * their filter state.
   */
  onClearAll?: () => void;
  /**
   * When true (and `onClearAll` is provided), the bar shows the
   * "Clear filters" trailing button. Decoupling visibility from the
   * callback existence lets pages render the button as a stable cell
   * even when no filters are active (kept hidden via this flag) without
   * us having to predicate the parent JSX on a `hasActive` recalc.
   */
  hasActiveFilters?: boolean;
  /**
   * Override label for the clear-all button. Defaults to "Clear filters".
   */
  clearAllLabel?: string;
}

export function FilterBar({
  children,
  className = '',
  loading = false,
  onClearAll,
  hasActiveFilters = false,
  clearAllLabel = 'Clear filters',
}: FilterBarProps) {
  const showClearAll = !!onClearAll && hasActiveFilters;
  return (
    <div
      className={`sticky top-0 z-10 bg-white pb-4 mb-0 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 ${className}`}
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
      {showClearAll && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
            aria-label={clearAllLabel}
          >
            <i className="mdi mdi-filter-remove-outline text-base" aria-hidden="true" />
            <span>{clearAllLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
