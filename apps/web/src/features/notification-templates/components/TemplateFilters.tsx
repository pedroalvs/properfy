import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import type { TemplateFiltersState } from '../types';

const CHANNEL_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
];

const INCLUDE_DEFAULTS_OPTIONS: FilterSelectOption[] = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
];

interface TemplateFiltersProps {
  filters: TemplateFiltersState;
  onFiltersChange: (filters: TemplateFiltersState) => void;
  /** Agency options (AM/OP only). Rendered as an "Agency" select when showTenantFilter is true. */
  tenantOptions?: FilterSelectOption[];
  /** Show the agency filter — only for cross-tenant roles (AM/OP). */
  showTenantFilter?: boolean;
}

export function TemplateFilters({
  filters,
  onFiltersChange,
  tenantOptions = [],
  showTenantFilter = false,
}: TemplateFiltersProps) {
  const agencyOptions: FilterSelectOption[] = [
    { label: 'All agencies', value: '' },
    ...tenantOptions,
  ];

  return (
    <FilterBar>
      {showTenantFilter && (
        <FilterSelect
          label="Agency"
          value={filters.tenantId}
          onChange={(tenantId) => onFiltersChange({ ...filters, tenantId })}
          options={agencyOptions}
        />
      )}
      <FilterInput
        label="Template Code"
        placeholder="INSPECTION_NOTICE"
        value={filters.templateCode}
        onChange={(templateCode) => onFiltersChange({ ...filters, templateCode })}
      />
      <FilterSelect
        label="Channel"
        value={filters.channel}
        onChange={(channel) => onFiltersChange({ ...filters, channel })}
        options={CHANNEL_OPTIONS}
      />
      <FilterSelect
        label="Include Platform Defaults"
        value={filters.includeDefaults}
        onChange={(includeDefaults) => onFiltersChange({ ...filters, includeDefaults: includeDefaults as 'true' | 'false' })}
        options={INCLUDE_DEFAULTS_OPTIONS}
      />
    </FilterBar>
  );
}
