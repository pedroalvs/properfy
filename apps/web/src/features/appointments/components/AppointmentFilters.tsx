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

/** Filters a screen can opt out of. The board hides both: status is its column axis. */
export type HideableAppointmentFilter = 'status' | 'showCancelled';

interface AppointmentFiltersProps {
  filters: AppointmentFiltersState;
  onFiltersChange: (filters: AppointmentFiltersState) => void;
  branchOptions: FilterSelectOption[];
  serviceTypeOptions: FilterSelectOption[];
  /**
   * Agency and inspector controls are opt-in by options rather than by an
   * internal role check: the pages own the RBAC (only AM/OP may list agencies)
   * and pass an empty array when a control must not appear.
   */
  agencyOptions?: FilterSelectOption[];
  inspectorOptions?: FilterSelectOption[];
  /**
   * Controls this screen renders instead of the filter bar. The board owns status
   * (one column per status) and always includes cancelled rows in its Cancelled
   * column, so both controls would contradict what the user sees.
   */
  hiddenFilters?: ReadonlyArray<HideableAppointmentFilter>;
}

export function AppointmentFilters({
  filters,
  onFiltersChange,
  branchOptions,
  serviceTypeOptions,
  agencyOptions = [],
  inspectorOptions = [],
  hiddenFilters = [],
}: AppointmentFiltersProps) {
  const isHidden = (name: HideableAppointmentFilter) => hiddenFilters.includes(name);

  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Code, address, tenant, phone..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      {!isHidden('status') && (
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(status) => onFiltersChange({ ...filters, status })}
          options={STATUS_OPTIONS}
        />
      )}
      <FilterSelect
        label="Service Type"
        value={filters.serviceTypeId}
        onChange={(serviceTypeId) => onFiltersChange({ ...filters, serviceTypeId })}
        options={serviceTypeOptions}
      />
      {agencyOptions.length > 0 && (
        <FilterSelect
          label="Agency"
          value={filters.tenantId}
          // Branch options cascade from the agency, so a branch left over from
          // the previous one would silently filter everything out.
          onChange={(tenantId) => onFiltersChange({ ...filters, tenantId, branchId: '' })}
          options={agencyOptions}
        />
      )}
      <FilterSelect
        label="Branch"
        value={filters.branchId}
        onChange={(branchId) => onFiltersChange({ ...filters, branchId })}
        options={branchOptions}
      />
      {inspectorOptions.length > 0 && (
        <FilterSelect
          label="Inspector"
          value={filters.inspectorId}
          onChange={(inspectorId) => onFiltersChange({ ...filters, inspectorId })}
          options={inspectorOptions}
        />
      )}
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
      {!isHidden('showCancelled') && (
        <FilterBoolean
          label="Show cancelled"
          value={filters.showCancelled}
          onChange={(showCancelled) => onFiltersChange({ ...filters, showCancelled })}
        />
      )}
      <FilterBoolean
        label="Overdue only"
        value={filters.overdueOnly}
        onChange={(overdueOnly) => onFiltersChange({ ...filters, overdueOnly })}
      />
    </FilterBar>
  );
}
