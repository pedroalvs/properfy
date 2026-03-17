import { filterContainer, filterLabel, filterIcon } from './filter-styles';

interface FilterDateRangeProps {
  label: string;
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

export function FilterDateRange({
  label,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: FilterDateRangeProps) {
  const hasValue = startDate !== '' || endDate !== '';

  return (
    <div className={filterContainer}>
      {hasValue && <span className={filterLabel}>{label}</span>}
      <div className="flex items-center gap-2 px-3 py-2">
        <i className={`mdi mdi-calendar ${filterIcon}`} />
        <input
          type="date"
          className="flex-1 bg-transparent text-sm text-text-primary outline-none"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          aria-label={`${label} - start`}
        />
        <span className="text-xs text-text-muted">to</span>
        <input
          type="date"
          className="flex-1 bg-transparent text-sm text-text-primary outline-none"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          aria-label={`${label} - end`}
        />
      </div>
    </div>
  );
}
