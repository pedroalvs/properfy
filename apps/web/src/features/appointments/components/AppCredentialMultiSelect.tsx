import { useMemo } from 'react';
import { FilterMultiSelect } from '@/components/filters/FilterMultiSelect';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { AppCredentialListItem } from '@properfy/shared';

interface AppCredentialMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Apps are tenant-scoped — only this agency's active apps are selectable. */
  tenantId?: string;
  /**
   * Narrows the options to this branch's apps plus agency-wide ones
   * (server-side OR semantics). Already-selected ids are never dropped.
   */
  branchId?: string;
  disabled?: boolean;
}

/**
 * Multi-select of the appointment agency's active app credentials. Mirrors the
 * contact autocomplete pattern (search/select from the registry); apps are a
 * small per-agency set, so a single multi-select dropdown is enough.
 */
export function AppCredentialMultiSelect({ value, onChange, tenantId, branchId, disabled }: AppCredentialMultiSelectProps) {
  const { data } = usePaginatedQuery<AppCredentialListItem>(
    ['app-credentials', 'form-options', tenantId ?? '', branchId ?? ''],
    '/v1/app-credentials',
    {
      page: 1, pageSize: 100, tenantId, isActive: 'true', sortBy: 'name', sortOrder: 'asc',
      ...(branchId ? { branchId } : {}),
    },
    { enabled: !!tenantId },
  );

  const options = useMemo(
    () =>
      (data?.data ?? []).map((a) => ({
        value: a.id,
        // Defaults already show on every appointment; selecting one is a harmless no-op.
        label: `${a.name} · ${a.username}${a.isDefault ? ' · always included' : ''}`,
      })),
    [data],
  );

  return (
    <FilterMultiSelect
      label="Apps"
      value={value}
      onChange={onChange}
      options={options}
      placeholder={disabled ? 'Select an agency first' : 'Select apps (optional)'}
      disabled={disabled}
    />
  );
}
