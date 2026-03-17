import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import type { TenantContactFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(TENANT_CONFIRMATION_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface TenantFiltersProps {
  filters: TenantContactFiltersState;
  onFiltersChange: (filters: TenantContactFiltersState) => void;
}

export function TenantFilters({
  filters,
  onFiltersChange,
}: TenantFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Name, email, phone..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Confirmation Status"
        value={filters.confirmationStatus}
        onChange={(confirmationStatus) => onFiltersChange({ ...filters, confirmationStatus })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
