import { useMemo } from 'react';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePermissions } from '@/hooks/usePermissions';
import type { Appointment } from '../types';

const ALL_OPTION: FilterSelectOption = { label: 'All', value: '' };

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
 * Agency options for the filter bar.
 *
 * `GET /v1/tenants` is `assertRoles(['AM','OP'])`, so the query stays disabled
 * for client roles and this returns `[]`. The filter bar renders the control
 * only when the array is non-empty, which is what keeps a CL_* session from
 * firing a request that can only ever 403.
 */
export function useAgencyFilterOptions(): FilterSelectOption[] {
  const { hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');

  const { options } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'appointment-list-filter'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
    { enabled: isGlobalRole },
  );

  return useMemo(
    () => (isGlobalRole && options.length > 0 ? [ALL_OPTION, ...options] : []),
    [isGlobalRole, options],
  );
}

/**
 * Inspector options for the filter bar — available to every role.
 *
 * `GET /v1/inspectors` scopes its own results (CL_* are pinned to their JWT
 * tenant, INSP to their own record), so no role gate is needed here.
 */
export function useInspectorFilterOptions(): FilterSelectOption[] {
  const { options } = useFormOptions<{ id: string; name: string }>(
    ['inspectors', 'appointment-list-filter'],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );

  return useMemo(() => (options.length > 0 ? [ALL_OPTION, ...options] : []), [options]);
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

  const { options: apiOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'appointment-list-filter', effectiveTenantId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { tenantId: effectiveTenantId, status: 'ACTIVE' },
    { enabled: !!effectiveTenantId },
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
      seen.set(appointment.branchId, appointment.branchName);
    }
    return [
      ALL_OPTION,
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [appointments]);
}
