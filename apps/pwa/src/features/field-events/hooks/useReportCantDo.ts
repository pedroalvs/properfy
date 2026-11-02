import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CantDoRequest } from '@properfy/shared';
import { apiPost } from '@/hooks/useApiQuery';
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
 */
export function useReportCantDo(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ReportCantDoInput>({
    mutationFn: async ({ body, idempotencyKey }) => {
      try {
        await apiPost(`/v1/inspector/appointments/${appointmentId}/cant-do`, body, {
          'Idempotency-Key': idempotencyKey,
        });
      } catch (err) {
        // Already reported (another device / a retry) is a success for us.
        if ((err as ApiError)?.code !== 'CANT_DO_ALREADY_REPORTED') throw err;
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
