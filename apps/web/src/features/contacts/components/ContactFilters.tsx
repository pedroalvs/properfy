import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { CONTACT_TYPE_MAP } from '@/lib/status-colors';
import type { ContactFiltersState } from '../types';

const TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(CONTACT_TYPE_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
  { label: 'All', value: '' },
];

interface ContactFiltersProps {
  filters: ContactFiltersState;
  onFiltersChange: (filters: ContactFiltersState) => void;
}

export function ContactFilters({ filters, onFiltersChange }: ContactFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Name, email, phone..."
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
        label="Status"
        value={filters.isActive}
        onChange={(isActive) => onFiltersChange({ ...filters, isActive })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
