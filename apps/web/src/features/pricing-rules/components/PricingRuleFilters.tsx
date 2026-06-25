import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { PricingRuleFiltersState } from '../types';

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  ...Object.entries(SERVICE_TYPE_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface PricingRuleFiltersProps {
  filters: PricingRuleFiltersState;
  onFiltersChange: (filters: PricingRuleFiltersState) => void;
  tenantOptions?: FilterSelectOption[];
  serviceTypeOptions?: FilterSelectOption[];
  branchOptions?: FilterSelectOption[];
}

export function PricingRuleFilters({
  filters,
  onFiltersChange,
  tenantOptions = [{ label: 'All', value: '' }],
  serviceTypeOptions = [{ label: 'All', value: '' }],
  branchOptions = [{ label: 'All', value: '' }],
}: PricingRuleFiltersProps) {
  return (
    <FilterBar>
      <FilterSelect
        label="Agency"
        value={filters.tenantId}
        onChange={(tenantId) => onFiltersChange({ ...filters, tenantId })}
        options={tenantOptions}
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
        label="Status"
        value={filters.status}
        onChange={(status) => onFiltersChange({ ...filters, status })}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
