import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { INVOICE_STATUS_BUCKETS } from '@properfy/shared';
import type { InvoiceFiltersState } from '../types';

// Product-facing 3-bucket status filter (spec 032). Bucket keys are sourced from the shared
// contract so a rename on the backend can't silently drift from the UI.
const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.keys(INVOICE_STATUS_BUCKETS).map((bucket) => ({
    label: bucket.charAt(0).toUpperCase() + bucket.slice(1),
    value: bucket,
  })),
];

interface InvoiceFiltersProps {
  filters: InvoiceFiltersState;
  onFiltersChange: (filters: InvoiceFiltersState) => void;
  inspectorOptions?: FilterSelectOption[];
  agencyOptions?: FilterSelectOption[];
  branchOptions?: FilterSelectOption[];
  /** Hide the status select when the page drives status externally (e.g. Pending/Done tabs). */
  hideStatus?: boolean;
}

export function InvoiceFilters({
  filters,
  onFiltersChange,
  inspectorOptions = [],
  agencyOptions = [],
  branchOptions = [],
  hideStatus = false,
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
      {!hideStatus && (
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(status) => onFiltersChange({ ...filters, status })}
          options={STATUS_OPTIONS}
        />
      )}
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
