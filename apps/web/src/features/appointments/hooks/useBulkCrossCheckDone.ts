import { useCreateMutation } from '@/hooks/useApiQuery';
import type {
  BulkCrossCheckDoneRequest,
  BulkCrossCheckDoneResponse,
} from '@properfy/shared';

/**
 * Bulk "Reviewed" action — cross-check a batch of DONE appointments
 * (field `doneCheckedByUserId`). Non-DONE / ineligible appointments come back
 * in `failed[]` (skipped with a warning); the mutation invalidates the
 * appointment list so reviewed rows refresh.
 */
export function useBulkCrossCheckDone() {
  return useCreateMutation<BulkCrossCheckDoneRequest, BulkCrossCheckDoneResponse>(
    '/v1/appointments/bulk-cross-check-done',
    [['appointments']],
  );
}
