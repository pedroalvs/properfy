import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceTypeFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(SERVICE_TYPE_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface ServiceTypeFiltersProps {
  filters: ServiceTypeFiltersState;
  onFiltersChange: (filters: ServiceTypeFiltersState) => void;
}

export function ServiceTypeFilters({ filters, onFiltersChange }: ServiceTypeFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Search by code or name..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
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
