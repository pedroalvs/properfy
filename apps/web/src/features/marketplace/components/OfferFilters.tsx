import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect } from '@/components/filters/FilterSelect';
import type { OfferFiltersState } from '../types';

interface OfferFiltersProps {
  filters: OfferFiltersState;
  onFiltersChange: (filters: OfferFiltersState) => void;
}

const PRIORITY_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Standard', value: 'STANDARD' },
  { label: '24h Priority', value: 'PRIORITY_24H' },
];

export function OfferFilters({ filters, onFiltersChange }: OfferFiltersProps) {
  return (
    <div className="p-4" data-testid="offer-filters">
      <FilterBar className="grid-cols-1 sm:grid-cols-2">
        <FilterInput
          label="Search"
          value={filters.search}
          onChange={(search) => onFiltersChange({ ...filters, search })}
          placeholder="Group name, region..."
        />
        <FilterSelect
          label="Priority"
          value={filters.priorityMode}
          onChange={(priorityMode) => onFiltersChange({ ...filters, priorityMode })}
          options={PRIORITY_OPTIONS}
          placeholder="All"
        />
        <FilterInput
          label="Date From"
          value={filters.dateFrom}
          onChange={(dateFrom) => onFiltersChange({ ...filters, dateFrom })}
          placeholder="YYYY-MM-DD"
          debounceMs={500}
        />
        <FilterInput
          label="Date To"
          value={filters.dateTo}
          onChange={(dateTo) => onFiltersChange({ ...filters, dateTo })}
          placeholder="YYYY-MM-DD"
          debounceMs={500}
        />
      </FilterBar>
    </div>
  );
}
