import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { INSPECTOR_STATUS_MAP } from '@/lib/status-colors';
import type { InspectorFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'Todos', value: '' },
  ...Object.entries(INSPECTOR_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface InspectorFiltersProps {
  filters: InspectorFiltersState;
  onFiltersChange: (filters: InspectorFiltersState) => void;
}

export function InspectorFilters({
  filters,
  onFiltersChange,
}: InspectorFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Buscar"
        placeholder="Nome, e-mail, telefone..."
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
