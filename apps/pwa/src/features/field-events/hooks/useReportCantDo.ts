import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CantDoRequest, CantDoResponse } from '@properfy/shared';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import {
  purgeAppointmentFromOfflineQueue,
} from '@/features/execution/lib/indexeddb';
import { refreshQueueSnapshot } from '@/features/execution/hooks/useOfflineQueue';

interface ReportCantDoInput {
  body: CantDoRequest;
  idempotencyKey: string;
}

/**
 * Report "Can't do this job" (F03, online-only — this never touches the offline
 * queue). On success, and on a 409 CANT_DO_ALREADY_REPORTED (the server already
 * rejected the job), the local queue + execution draft for the appointment are
 * purged and the schedule/detail queries are invalidated so the job leaves the
 * route. Any other error rejects so the sheet can show the server message.
 *
 * Returns the `CantDoResponse` (incl. `eventId`) so a caller can link a follow-up
 * property issue via `cantDoEventId` (F10-3, D18); returns `null` when the job was
 * already reported (no new event to link).
 */
export function useReportCantDo(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation<CantDoResponse | null, ApiError, ReportCantDoInput>({
    mutationFn: async ({ body, idempotencyKey }) => {
      try {
        const res = await apiPost<SuccessResponse<CantDoResponse>>(
          `/v1/inspector/appointments/${appointmentId}/cant-do`,
          body,
          { 'Idempotency-Key': idempotencyKey },
        );
        return res.data;
      } catch (err) {
        // Already reported (another device / a retry) is a success for us, but
        // there is no fresh event to link an issue to.
        if ((err as ApiError)?.code !== 'CANT_DO_ALREADY_REPORTED') throw err;
        return null;
      }
    },
    onSuccess: async () => {
      await purgeAppointmentFromOfflineQueue(appointmentId);
      await refreshQueueSnapshot();
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'day-plan'] });
    },
  });
}
