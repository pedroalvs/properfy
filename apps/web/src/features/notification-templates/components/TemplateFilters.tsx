import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import type { TemplateFiltersState } from '../types';

const CHANNEL_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
];

const ACTIVE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

interface TemplateFiltersProps {
  filters: TemplateFiltersState;
  onFiltersChange: (filters: TemplateFiltersState) => void;
}

export function TemplateFilters({
  filters,
  onFiltersChange,
}: TemplateFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Template code, subject..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Channel"
        value={filters.channel}
        onChange={(channel) => onFiltersChange({ ...filters, channel })}
        options={CHANNEL_OPTIONS}
      />
      <FilterSelect
        label="Status"
        value={filters.active}
        onChange={(active) => onFiltersChange({ ...filters, active })}
        options={ACTIVE_OPTIONS}
      />
    </FilterBar>
  );
}
