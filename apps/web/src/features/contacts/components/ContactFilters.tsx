import { useMemo } from 'react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { FilterMultiSelect, type FilterMultiSelectOption } from '@/components/filters/FilterMultiSelect';
import { CONTACT_TYPE_MAP } from '@/lib/status-colors';
import { useBranchList } from '@/features/tenants';
import type { ContactFiltersState } from '../types';

const TYPE_OPTIONS: FilterMultiSelectOption[] = Object.entries(CONTACT_TYPE_MAP).map(
  ([value, config]) => ({ label: config.label, value }),
);

const STATUS_OPTIONS: FilterSelectOption[] = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
  { label: 'All', value: '' },
];

const PRIMARY_OPTIONS: FilterSelectOption[] = [
  { label: 'Any', value: '' },
  { label: 'Yes — primary in ≥1 property', value: 'YES' },
  { label: 'No — never primary', value: 'NO' },
];

interface ContactFiltersProps {
  filters: ContactFiltersState;
  onFiltersChange: (filters: ContactFiltersState) => void;
  /**
   * Tenant id to populate the branch multiselect. AM/OP pass the
   * agency-selected tenant; CL_* pass their JWT tenant. When `null`, the
   * branch dropdown is disabled (no tenant context to filter by).
   */
  tenantId: string | null;
}

/**
 * Filters for the Contacts list (023 §FR-204/205).
 *
 * Renders: search · type multiselect · branch multiselect · status select
 * · primary select. Multiselects use the shared `FilterMultiSelect`
 * dropdown so the bar visually aligns with /appointments and stays on
 * the legacy outlined+dense single-line height (replaces the native
 * `<select multiple>` h-24 boxes that broke the visual rhythm).
 */
export function ContactFilters({ filters, onFiltersChange, tenantId }: ContactFiltersProps) {
  const { data: branches } = useBranchList(tenantId);
  const branchOptions = useMemo<FilterMultiSelectOption[]>(
    () => branches.map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  return (
    <FilterBar>
      <FilterInput
        label="Search"
        placeholder="Name, email, phone..."
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <FilterMultiSelect
        label="Type"
        value={filters.type}
        onChange={(type) => onFiltersChange({ ...filters, type })}
        options={TYPE_OPTIONS}
      />
      <FilterMultiSelect
        label="Branches"
        value={filters.branchIds}
        onChange={(branchIds) => onFiltersChange({ ...filters, branchIds })}
        options={branchOptions}
        disabled={!tenantId}
      />
      <FilterSelect
        label="Status"
        value={filters.isActive}
        onChange={(isActive) => onFiltersChange({ ...filters, isActive })}
        options={STATUS_OPTIONS}
      />
      <FilterSelect
        label="Primary in any property"
        value={filters.primary}
        onChange={(primary) => onFiltersChange({ ...filters, primary: primary as ContactFiltersState['primary'] })}
        options={PRIMARY_OPTIONS}
      />
    </FilterBar>
  );
}
