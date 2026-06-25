import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { INVOICE_STATUS_MAP } from '@/lib/status-colors';
import type { InvoiceFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(INVOICE_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface InvoiceFiltersProps {
  filters: InvoiceFiltersState;
  onFiltersChange: (filters: InvoiceFiltersState) => void;
  inspectorOptions?: FilterSelectOption[];
}

export function InvoiceFilters({ filters, onFiltersChange, inspectorOptions = [] }: InvoiceFiltersProps) {
  return (
    <FilterBar>
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
