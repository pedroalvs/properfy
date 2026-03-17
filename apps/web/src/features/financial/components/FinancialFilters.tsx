import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
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
      <FilterInput
        label="Search"
        placeholder="Description, inspection code..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
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
