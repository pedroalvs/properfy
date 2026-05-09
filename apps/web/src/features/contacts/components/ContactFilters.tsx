import { useMemo } from 'react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterSelect, type FilterSelectOption } from '@/components/filters/FilterSelect';
import { CONTACT_TYPE_MAP } from '@/lib/status-colors';
import { useBranchList } from '@/features/tenants';
import type { ContactFiltersState } from '../types';

const TYPE_OPTIONS: FilterSelectOption[] = Object.entries(CONTACT_TYPE_MAP).map(
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
 * · primary select. Multiselects use native `<select multiple>` to avoid
 * pulling a new dependency; selection is mirrored into `filters.type` and
 * `filters.branchIds` arrays.
 */
export function ContactFilters({ filters, onFiltersChange, tenantId }: ContactFiltersProps) {
  const { data: branches } = useBranchList(tenantId);
  const branchOptions = useMemo(
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
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-secondary">Type (Ctrl+click for multi)</label>
        <select
          multiple
          aria-label="Type"
          className="h-24 rounded border border-default bg-surface px-2 py-1 text-sm"
          value={filters.type}
          onChange={(e) => {
            const next = Array.from(e.target.selectedOptions, (o) => o.value);
            onFiltersChange({ ...filters, type: next });
          }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-secondary">Branches (Ctrl+click for multi)</label>
        <select
          multiple
          aria-label="Branches"
          className="h-24 rounded border border-default bg-surface px-2 py-1 text-sm disabled:opacity-50"
          disabled={!tenantId}
          value={filters.branchIds}
          onChange={(e) => {
            const next = Array.from(e.target.selectedOptions, (o) => o.value);
            onFiltersChange({ ...filters, branchIds: next });
          }}
        >
          {branchOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
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
