import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import type { AuditLogFiltersState } from '../types';

const ENTITY_TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Appointment', value: 'Appointment' },
  { label: 'Availability Slot', value: 'AvailabilitySlot' },
  { label: 'Financial Entry', value: 'FinancialEntry' },
  { label: 'Inspector', value: 'Inspector' },
  { label: 'Notification Template', value: 'NOTIFICATION_TEMPLATE' },
  { label: 'Pricing Rule', value: 'PricingRule' },
  { label: 'Property', value: 'Property' },
  { label: 'Service Group', value: 'ServiceGroup' },
  { label: 'User', value: 'USER' },
];

const ACTION_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Appointment Created', value: 'appointment.created' },
  { label: 'Appointment Updated', value: 'appointment.updated' },
  { label: 'Status Transition', value: 'appointment.status_transition' },
  { label: 'Login', value: 'auth.login' },
  { label: 'Logout', value: 'auth.logout' },
  { label: 'Pricing Rule Created', value: 'pricing_rule.created' },
  { label: 'Pricing Rule Updated', value: 'pricing_rule.updated' },
  { label: 'Financial Entry Approved', value: 'financial_entry.approved' },
  { label: 'Notification Template Upserted', value: 'NOTIFICATION_TEMPLATE_UPSERTED' },
];

interface AuditLogFiltersProps {
  filters: AuditLogFiltersState;
  onFiltersChange: (filters: AuditLogFiltersState) => void;
}

export function AuditLogFilters({ filters, onFiltersChange }: AuditLogFiltersProps) {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';

  const { options: actorUserOptions } = useFormOptions<{ id: string; name: string }>(
    ['audit-log-actors', isGlobalRole ? 'internal' : user?.tenantId],
    isGlobalRole ? '/v1/users' : `/v1/tenants/${user?.tenantId}/users`,
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole || !!user?.tenantId },
  );
  const actorOptions: FilterSelectOption[] = [{ label: 'All', value: '' }, ...actorUserOptions];

  return (
    <FilterBar>
      <FilterSelect
        label="Actor"
        value={filters.actorId}
        onChange={(actorId) => onFiltersChange({ ...filters, actorId })}
        options={actorOptions}
      />
      <FilterSelect
        label="Entity Type"
        value={filters.entityType}
        onChange={(entityType) => onFiltersChange({ ...filters, entityType })}
        options={ENTITY_TYPE_OPTIONS}
      />
      <FilterInput
        label="Entity ID"
        placeholder="Filter by entity UUID"
        value={filters.entityId}
        onChange={(entityId) => onFiltersChange({ ...filters, entityId })}
      />
      <FilterSelect
        label="Action"
        value={filters.action}
        onChange={(action) => onFiltersChange({ ...filters, action })}
        options={ACTION_OPTIONS}
      />
      <FilterDateRange
        label="Date"
        startDate={filters.fromDate}
        endDate={filters.toDate}
        onStartChange={(fromDate) => onFiltersChange({ ...filters, fromDate })}
        onEndChange={(toDate) => onFiltersChange({ ...filters, toDate })}
      />
    </FilterBar>
  );
}
