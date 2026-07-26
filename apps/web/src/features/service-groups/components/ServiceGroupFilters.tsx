import { useRef } from 'react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceGroupFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(SERVICE_GROUP_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface ServiceGroupFiltersProps {
  filters: ServiceGroupFiltersState;
  onFiltersChange: (filters: ServiceGroupFiltersState) => void;
}

export function ServiceGroupFilters({
  filters,
  onFiltersChange,
}: ServiceGroupFiltersProps) {
  // FilterInput calls the handler captured at keystroke time. Merging into the
  // render-time `filters` would revert a status picked inside the 300ms debounce
  // window, so the debounced merge reads the latest value instead.
  const latestFilters = useRef(filters);
  latestFilters.current = filters;

  return (
    <FilterBar>
      <FilterInput
        label="Search"
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...latestFilters.current, search })}
        placeholder="Group code, description..."
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
