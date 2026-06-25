import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { TENANT_ADMIN_STATUS_MAP } from '@/lib/status-colors';
import type { TenantAdminFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(TENANT_ADMIN_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface TenantAdminFiltersProps {
  filters: TenantAdminFiltersState;
  onFiltersChange: (filters: TenantAdminFiltersState) => void;
}

export function TenantAdminFilters({
  filters,
  onFiltersChange,
}: TenantAdminFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Name, legal name..."
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
