import { useMemo } from 'react';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { useFormOptions } from '@/hooks/useFormOptions';
import type { Appointment } from '../types';

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

  return useMemo(() => [{ label: 'All', value: '' }, ...options], [options]);
}

/**
 * Branch options derived from the appointments already on screen.
 *
 * The AM/OP fallback: neither screen has a tenant selector, so `/v1/branches`
 * cannot be called reliably cross-tenant. Acknowledged limitation, tracked as
 * a follow-up. CL roles fetch the real list instead — see the list page.
 */
export function useBranchOptionsFromAppointments(appointments: Appointment[]): FilterSelectOption[] {
  return useMemo(() => {
    const seen = new Map<string, string>();
    for (const appointment of appointments) {
      seen.set(appointment.branchId, appointment.branchName);
    }
    return [
      { label: 'All', value: '' },
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [appointments]);
}
