import { FilterBar } from '@/components/filters/FilterBar';
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
  return (
    <FilterBar>
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
