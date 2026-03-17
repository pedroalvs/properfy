import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { PROPERTY_TYPE_MAP } from '@/lib/status-colors';
import type { PropertyFiltersState } from '../types';

const TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(PROPERTY_TYPE_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface PropertyFiltersProps {
  filters: PropertyFiltersState;
  onFiltersChange: (filters: PropertyFiltersState) => void;
  branchOptions: FilterSelectOption[];
}

export function PropertyFilters({
  filters,
  onFiltersChange,
  branchOptions,
}: PropertyFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Code, address, suburb..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Type"
        value={filters.type}
        onChange={(type) => onFiltersChange({ ...filters, type })}
        options={TYPE_OPTIONS}
      />
      <FilterSelect
        label="Branch"
        value={filters.branchId}
        onChange={(branchId) => onFiltersChange({ ...filters, branchId })}
        options={branchOptions}
      />
    </FilterBar>
  );
}
