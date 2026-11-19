import { useMutation } from '@tanstack/react-query';
import type { LateNoticeRequest, LateNoticeResponse } from '@properfy/shared';
import { apiPost } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';

interface ReportLateNoticeInput {
  body: LateNoticeRequest;
  idempotencyKey: string;
}

/**
 * Report "Running late" (F03, online-only — never the offline queue). Returns the
 * server's computed ETA (`estimatedArrivalAt`, `minutesLate`, `referenceSource`)
 * so the sheet can confirm the arrival time. No status change, so nothing to
 * purge or invalidate; errors (e.g. a 422 after check-in) surface in the sheet.
 */
export function useReportLateNotice(appointmentId: string) {
  return useMutation<LateNoticeResponse, ApiError, ReportLateNoticeInput>({
    mutationFn: async ({ body, idempotencyKey }) => {
      const result = await apiPost<{ data: LateNoticeResponse }>(
        `/v1/inspector/appointments/${appointmentId}/late-notice`,
        body,
        { 'Idempotency-Key': idempotencyKey },
      );
      return result.data;
    },
  });
}
