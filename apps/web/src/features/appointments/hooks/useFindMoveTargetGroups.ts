import { useCreateMutation } from '@/hooks/useApiQuery';
import type { FindMoveTargetsRequest, FindMoveTargetsResponse } from '@properfy/shared';

/**
 * Pre-filters the move-destination dropdown to only the active groups the selected
 * (already-grouped) appointments can be moved into — today or later, today only
 * before the 18:50 Sydney cutoff, their own current group excluded. Modelled as a
 * mutation because the check is intent-driven (fired when the modal opens).
 */
export function useFindMoveTargetGroups() {
  return useCreateMutation<FindMoveTargetsRequest, FindMoveTargetsResponse>(
    '/v1/service-groups/find-move-targets-for-appointments',
    [], // read-only, no invalidation
  );
}
