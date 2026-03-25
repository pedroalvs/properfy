import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FINANCIAL_ENTRY_TYPE_MAP, FINANCIAL_ENTRY_STATUS_MAP } from '@/lib/status-colors';
import type { FinancialFiltersState } from '../types';

const TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(FINANCIAL_ENTRY_TYPE_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(FINANCIAL_ENTRY_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface FinancialFiltersProps {
  filters: FinancialFiltersState;
  onFiltersChange: (filters: FinancialFiltersState) => void;
}

export function FinancialFilters({
  filters,
  onFiltersChange,
}: FinancialFiltersProps) {
  return (
    <FilterBar>
      <FilterSelect
        label="Type"
        value={filters.entryType}
        onChange={(entryType) => onFiltersChange({ ...filters, entryType })}
        options={TYPE_OPTIONS}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
