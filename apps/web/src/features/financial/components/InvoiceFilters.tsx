import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import type { InvoiceFiltersState } from '../types';

// Product-facing 3-bucket status filter (spec 032): Pending / Approved / Rejected.
const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

interface InvoiceFiltersProps {
  filters: InvoiceFiltersState;
  onFiltersChange: (filters: InvoiceFiltersState) => void;
  inspectorOptions?: FilterSelectOption[];
  agencyOptions?: FilterSelectOption[];
  branchOptions?: FilterSelectOption[];
}

export function InvoiceFilters({
  filters,
  onFiltersChange,
  inspectorOptions = [],
  agencyOptions = [],
  branchOptions = [],
}: InvoiceFiltersProps) {
  return (
    <FilterBar>
      <FilterSelect
        label="Agency"
        value={filters.agencyId}
        // Changing agency resets the branch (branch options cascade from the agency).
        onChange={(agencyId) => onFiltersChange({ ...filters, agencyId, branchId: '' })}
        options={[{ label: 'All', value: '' }, ...agencyOptions]}
      />
      <FilterSelect
        label="Branch"
        value={filters.branchId}
        onChange={(branchId) => onFiltersChange({ ...filters, branchId })}
        options={[{ label: 'All', value: '' }, ...branchOptions]}
      />
      <FilterSelect
        label="Inspector"
        value={filters.inspectorId}
        onChange={(inspectorId) => onFiltersChange({ ...filters, inspectorId })}
        options={[{ label: 'All', value: '' }, ...inspectorOptions]}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
      <FilterDateRange
        label="Period"
        startDate={filters.periodStart}
        endDate={filters.periodEnd}
        onStartChange={(periodStart) => onFiltersChange({ ...filters, periodStart })}
        onEndChange={(periodEnd) => onFiltersChange({ ...filters, periodEnd })}
      />
    </FilterBar>
  );
}
