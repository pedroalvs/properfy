import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import type { AuditLogFiltersState } from '../types';

const ENTITY_TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Appointment', value: 'APPOINTMENT' },
  { label: 'Property', value: 'PROPERTY' },
  { label: 'User', value: 'USER' },
  { label: 'Tenant', value: 'TENANT' },
  { label: 'Inspector', value: 'INSPECTOR' },
  { label: 'Financial Entry', value: 'FINANCIAL_ENTRY' },
  { label: 'Service Group', value: 'SERVICE_GROUP' },
  { label: 'Service Type', value: 'SERVICE_TYPE' },
  { label: 'Pricing Rule', value: 'PRICING_RULE' },
];

const ACTION_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Create', value: 'CREATE' },
  { label: 'Update', value: 'UPDATE' },
  { label: 'Delete', value: 'DELETE' },
  { label: 'Status Transition', value: 'STATUS_TRANSITION' },
  { label: 'Login', value: 'LOGIN' },
  { label: 'Logout', value: 'LOGOUT' },
];

interface AuditLogFiltersProps {
  filters: AuditLogFiltersState;
  onFiltersChange: (filters: AuditLogFiltersState) => void;
}

export function AuditLogFilters({ filters, onFiltersChange }: AuditLogFiltersProps) {
  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Search by entity ID or actor..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterSelect
        label="Entity Type"
        value={filters.entityType}
        onChange={(entityType) => onFiltersChange({ ...filters, entityType })}
        options={ENTITY_TYPE_OPTIONS}
      />
      <FilterSelect
        label="Action"
        value={filters.action}
        onChange={(action) => onFiltersChange({ ...filters, action })}
        options={ACTION_OPTIONS}
      />
      <FilterDateRange
        label="Date"
        startDate={filters.startDate}
        endDate={filters.endDate}
        onStartChange={(startDate) => onFiltersChange({ ...filters, startDate })}
        onEndChange={(endDate) => onFiltersChange({ ...filters, endDate })}
      />
    </FilterBar>
  );
}
