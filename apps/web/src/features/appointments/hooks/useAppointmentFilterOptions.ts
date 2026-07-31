import { useMemo } from 'react';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { useAuth } from '@/hooks/useAuth';
import { useAllPagesQuery, type ListParams } from '@/hooks/useApiQuery';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePermissions } from '@/hooks/usePermissions';
import type { Appointment } from '../types';

const ALL_OPTION: FilterSelectOption = { label: 'All', value: '' };

/**
 * Options for a whole catalogue, not just its first page.
 *
 * `useFormOptions` asks for a single `pageSize: 100` page, and the backend caps
 * `pageSize` at 100 (`paginationSchema`), so a bigger page is a 400 rather than
 * a fix. Past the 100th agency or inspector the entity would be unfilterable
 * while its appointments still show its name in the table — a filter that
 * silently cannot reach part of its own data. `useAllPagesQuery` pages through
 * (with its own 50-page hard stop) and memoizes per fetch result.
 */
function useAllPagesOptions(
  queryKey: unknown[],
  path: string,
  params: ListParams,
  enabled = true,
): FilterSelectOption[] {
  const { data } = useAllPagesQuery<{ id: string; name: string }>(queryKey, path, params, {
    enabled,
  });

  return useMemo(
    () => (data?.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    [data],
  );
}

/**
 * Service-type options for the appointments filter bar. Service types are
 * global (not tenant-scoped), so the query key is stable — cached, never
 * refetched when another filter changes. Shared by the list and the board.
 */
export function useServiceTypeFilterOptions(): FilterSelectOption[] {
  const { options } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'appointment-list-filter'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );

  return useMemo(() => [ALL_OPTION, ...options], [options]);
}

/**
 * Agency options for the filter bar. Empty for client roles, which is how the
 * filter bar knows not to render the control.
 *
 * `GET /v1/tenants` is `assertRoles(['AM','OP'])`. **`enabled: isGlobalRole` is
 * what stops a CL_* session firing a guaranteed 403** — not the filter bar
 * declining to render, since this hook runs on mount either way. Do not drop
 * that flag on the theory that a hidden control makes no request.
 *
 * Visibility keys off the role alone, never off how many options came back: an
 * AM opening a shared `?tenantId=…` link while this query is in flight (or
 * failing, or naming an inactive agency) still needs the control in order to
 * see and clear the filter that is narrowing their list.
 */
export function useAgencyFilterOptions(): FilterSelectOption[] {
  const { hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');

  const options = useAllPagesOptions(
    ['tenants', 'appointment-list-filter'],
    '/v1/tenants',
    { status: 'ACTIVE' },
    isGlobalRole,
  );

  return useMemo(
    () => (isGlobalRole ? [ALL_OPTION, ...options] : []),
    [isGlobalRole, options],
  );
}

/**
 * Inspector options for the filter bar — available to every role.
 *
 * `GET /v1/inspectors` scopes its own results (CL_* are pinned to their JWT
 * tenant, INSP to their own record), so no role gate is needed here. Always
 * returns at least `All`, so an applied `inspectorId` is always clearable.
 */
export function useInspectorFilterOptions(): FilterSelectOption[] {
  const options = useAllPagesOptions(
    ['inspectors', 'appointment-list-filter'],
    '/v1/inspectors',
    { status: 'ACTIVE' },
  );

  return useMemo(() => [ALL_OPTION, ...options], [options]);
}

/**
 * Branch options. Branches are tenant-scoped on the backend, so which list is
 * correct depends on the agency in play:
 *
 * - CL roles — the real list, pinned to their JWT tenant.
 * - AM/OP with an agency selected — that agency's real list, so a branch with no
 *   appointment on the current page is still selectable.
 * - AM/OP with no agency — `/v1/branches` returns nothing without a tenant to
 *   scope to, so the options fall back to the branches on the loaded rows.
 */
export function useBranchFilterOptions(
  selectedTenantId: string,
  appointments: Appointment[],
): FilterSelectOption[] {
  const { hasRole } = usePermissions();
  const { user } = useAuth();
  const isGlobalRole = hasRole('AM', 'OP');

  // An AM/OP JWT tenant is not a scope — for them only an explicit selection is.
  const effectiveTenantId = isGlobalRole ? selectedTenantId : (user?.tenantId ?? '');

  const apiOptions = useAllPagesOptions(
    ['branches', 'appointment-list-filter', effectiveTenantId],
    '/v1/branches',
    { tenantId: effectiveTenantId, status: 'ACTIVE' },
    !!effectiveTenantId,
  );

  const derivedOptions = useBranchOptionsFromAppointments(appointments);

  return useMemo(
    () => (effectiveTenantId ? [ALL_OPTION, ...apiOptions] : derivedOptions),
    [effectiveTenantId, apiOptions, derivedOptions],
  );
}

/**
 * Branch options derived from the appointments already on screen — the AM/OP
 * fallback used until an agency is picked. Internal to `useBranchFilterOptions`:
 * screens should ask for branch options once and let that hook decide the source.
 */
function useBranchOptionsFromAppointments(appointments: Appointment[]): FilterSelectOption[] {
  return useMemo(() => {
    const seen = new Map<string, string>();
    for (const appointment of appointments) {
      // The backend maps an unresolved branch relation to '', which would put a
      // blank, unreadable entry in the dropdown.
      seen.set(appointment.branchId, appointment.branchName || '—');
    }
    return [
      ALL_OPTION,
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [appointments]);
}
