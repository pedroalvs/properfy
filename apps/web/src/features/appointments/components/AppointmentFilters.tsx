import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { FilterBoolean } from '@/components/filters/FilterBoolean';
import { APPOINTMENT_STATUS_MAP, RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import type { AppointmentFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(APPOINTMENT_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

const RENTAL_TENANT_CONFIRMATION_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(RENTAL_TENANT_CONFIRMATION_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface AppointmentFiltersProps {
  filters: AppointmentFiltersState;
  onFiltersChange: (filters: AppointmentFiltersState) => void;
  branchOptions: FilterSelectOption[];
  serviceTypeOptions: FilterSelectOption[];
}

export function AppointmentFilters({
  filters,
  onFiltersChange,
  branchOptions,
  serviceTypeOptions,
}: AppointmentFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Code, address, tenant, phone..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
      <FilterSelect
        label="Service Type"
        value={filters.serviceTypeId}
        onChange={(serviceTypeId) => onFiltersChange({ ...filters, serviceTypeId })}
        options={serviceTypeOptions}
      />
      <FilterSelect
        label="Branch"
        value={filters.branchId}
        onChange={(branchId) => onFiltersChange({ ...filters, branchId })}
        options={branchOptions}
      />
      <FilterSelect
        label="Confirmation"
        value={filters.rentalTenantConfirmationStatus}
        onChange={(rentalTenantConfirmationStatus) => onFiltersChange({ ...filters, rentalTenantConfirmationStatus })}
        options={RENTAL_TENANT_CONFIRMATION_OPTIONS}
      />
      <FilterDateRange
        label="Period"
        startDate={filters.startDate}
        endDate={filters.endDate}
        onStartChange={(startDate) => onFiltersChange({ ...filters, startDate })}
        onEndChange={(endDate) => onFiltersChange({ ...filters, endDate })}
      />
      <FilterBoolean
        label="Show cancelled"
        value={filters.showCancelled}
        onChange={(showCancelled) => onFiltersChange({ ...filters, showCancelled })}
      />
      <FilterBoolean
        label="Overdue only"
        value={filters.overdueOnly}
        onChange={(overdueOnly) => onFiltersChange({ ...filters, overdueOnly })}
      />
    </FilterBar>
  );
}
