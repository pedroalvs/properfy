import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { USER_ROLE_MAP, USER_STATUS_MAP } from '@/lib/status-colors';
import type { UserFiltersState } from '../types';

const ROLE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(USER_ROLE_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(USER_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface UserFiltersProps {
  filters: UserFiltersState;
  onFiltersChange: (filters: UserFiltersState) => void;
}

export function UserFilters({
  filters,
  onFiltersChange,
}: UserFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Name, email, phone..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Role"
        value={filters.role}
        onChange={(role) => onFiltersChange({ ...filters, role })}
        options={ROLE_OPTIONS}
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
