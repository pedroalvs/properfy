import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { AvailabilitySlotStatus } from '@properfy/shared';
import type { SlotFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Available', value: AvailabilitySlotStatus.AVAILABLE },
  { label: 'Booked', value: AvailabilitySlotStatus.BOOKED },
  { label: 'Cancelled', value: AvailabilitySlotStatus.CANCELLED },
];

interface SlotFiltersProps {
  filters: SlotFiltersState;
  onFiltersChange: (filters: SlotFiltersState) => void;
}

export function SlotFilters({ filters, onFiltersChange }: SlotFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Search by inspector or region..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
      <FilterDateRange
        label="Date"
        startDate={filters.dateFrom}
        endDate={filters.dateTo}
        onStartChange={(dateFrom) => onFiltersChange({ ...filters, dateFrom })}
        onEndChange={(dateTo) => onFiltersChange({ ...filters, dateTo })}
      />
    </FilterBar>
  );
}
