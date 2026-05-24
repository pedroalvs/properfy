import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkCancelRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 025 §FR-411 — bulk cancel from the appointment map flow.
 *
 * Invalidates the map listing so cancelled rows update their status chip
 * + colour. Per-item results land in `response.data.results`; the modal
 * surfaces typed per-item failures (FORBIDDEN / INVALID_TRANSITION /
 * NOT_FOUND / IDEMPOTENT_REPLAY) without aborting the batch.
 */
export function useBulkCancelAppointments() {
  return useCreateMutation<BulkCancelRequest, BulkActionResponse>(
    '/v1/appointments/bulk-cancel',
    [['appointments-map'], ['appointments']],
  );
}
