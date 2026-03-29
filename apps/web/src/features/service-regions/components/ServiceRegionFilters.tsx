import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import type { ServiceRegionFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

const COUNTRY_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Australia', value: 'AU' },
  { label: 'Brazil', value: 'BR' },
];

interface ServiceRegionFiltersProps {
  filters: ServiceRegionFiltersState;
  onFiltersChange: (filters: ServiceRegionFiltersState) => void;
}

export function ServiceRegionFilters({ filters, onFiltersChange }: ServiceRegionFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Search by name..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Country"
        value={filters.country}
        onChange={(country) => onFiltersChange({ ...filters, country })}
        options={COUNTRY_OPTIONS}
      />
      <FilterInput
        label="State"
        placeholder="e.g. NSW, VIC"
        value={filters.state}
        onChange={(state) => onFiltersChange({ ...filters, state })}
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
