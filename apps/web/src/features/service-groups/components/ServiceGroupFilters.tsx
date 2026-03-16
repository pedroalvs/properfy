import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceGroupFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'Todos', value: '' },
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
      <FilterInput
        label="Buscar"
        placeholder="Nome, região, inspetor..."
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
