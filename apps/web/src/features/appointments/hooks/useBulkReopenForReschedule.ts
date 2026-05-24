import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkReopenForRescheduleRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 026 §FR-540 — Bulk reopen for reschedule. Same-group-only in this
 * cycle (cross-group is GAP-501 future). Per-item statuses follow the
 * 025 bulk action envelope so the modal can re-use the same summary
 * surface.
 */
export function useBulkReopenForReschedule() {
  return useCreateMutation<BulkReopenForRescheduleRequest, BulkActionResponse>(
    '/v1/appointments/bulk-reopen-for-reschedule',
    [['appointments-map'], ['appointments']],
  );
}
