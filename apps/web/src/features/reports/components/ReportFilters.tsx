import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { REPORT_TYPE_MAP, REPORT_STATUS_MAP } from '@/lib/status-colors';
import type { ReportFiltersState } from '../types';

const TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(REPORT_TYPE_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(REPORT_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface ReportFiltersProps {
  filters: ReportFiltersState;
  onFiltersChange: (filters: ReportFiltersState) => void;
}

export function ReportFilters({
  filters,
  onFiltersChange,
}: ReportFiltersProps) {
  return (
    <FilterBar>
      <FilterSelect
        label="Type"
        value={filters.reportType}
        onChange={(reportType) => onFiltersChange({ ...filters, reportType })}
        options={TYPE_OPTIONS}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
      <FilterInput
        label="From Date"
        value={filters.fromDate}
        onChange={(fromDate) => onFiltersChange({ ...filters, fromDate })}
        placeholder="YYYY-MM-DD"
        debounceMs={500}
      />
      <FilterInput
        label="To Date"
        value={filters.toDate}
        onChange={(toDate) => onFiltersChange({ ...filters, toDate })}
        placeholder="YYYY-MM-DD"
        debounceMs={500}
      />
    </FilterBar>
  );
}
