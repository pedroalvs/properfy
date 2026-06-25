import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { DEFAULT_APP_FILTERS, type AppFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
  { label: 'All', value: '' },
];

interface AppFiltersProps {
  filters: AppFiltersState;
  onFiltersChange: (filters: AppFiltersState) => void;
}

export function AppFilters({ filters, onFiltersChange }: AppFiltersProps) {
  const hasActiveFilters =
    filters.search !== DEFAULT_APP_FILTERS.search || filters.isActive !== DEFAULT_APP_FILTERS.isActive;

  return (
    <FilterBar onClearAll={() => onFiltersChange(DEFAULT_APP_FILTERS)} hasActiveFilters={hasActiveFilters}>
      <FilterInput
        label="Search"
        placeholder="Name or username..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Status"
        value={filters.isActive}
        onChange={(isActive) => onFiltersChange({ ...filters, isActive })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
