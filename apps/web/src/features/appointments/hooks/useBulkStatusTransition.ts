import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkStatusTransitionRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 025 §FR-431 — bulk status transition (release / reopen / reject)
 * from the appointment map flow. The shared transition matrix at
 * `packages/shared/src/lib/appointment-transitions.ts` is the single
 * source of truth for which targets are exposed in the modal footer.
 */
export function useBulkStatusTransition() {
  return useCreateMutation<BulkStatusTransitionRequest, BulkActionResponse>(
    '/v1/appointments/bulk-status-transition',
    [['appointments-map'], ['appointments']],
  );
}
