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
      <div className="px-3 py-[7px]">
        <div className="mb-2 flex items-center gap-2 sm:mb-0 sm:hidden">
          <i className={`mdi mdi-calendar ${filterIcon}`} />
          <span className="text-sm text-text-muted">{label}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="hidden items-center gap-2 sm:flex">
            <i className={`mdi mdi-calendar ${filterIcon}`} />
          </div>
          <input
            type="date"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            aria-label={`${label} - start`}
          />
          <span className="px-1 text-xs text-text-muted sm:px-0">to</span>
          <input
            type="date"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            aria-label={`${label} - end`}
          />
        </div>
      </div>
    </div>
  );
}
