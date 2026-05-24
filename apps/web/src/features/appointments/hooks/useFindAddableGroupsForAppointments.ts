import { useCreateMutation } from '@/hooks/useApiQuery';
import type { FindAddableGroupsRequest, FindAddableGroupsResponse } from '@properfy/shared';

/**
 * 026 B1 — pre-filters the group dropdown to only show groups that can
 * accept ALL of the selected appointments. Modelled as a mutation because
 * the check is intent-driven (triggered when the modal opens, not on mount).
 */
export function useFindAddableGroupsForAppointments() {
  return useCreateMutation<FindAddableGroupsRequest, FindAddableGroupsResponse>(
    '/v1/service-groups/find-addable-for-appointments',
    [], // read-only, no invalidation
  );
}
