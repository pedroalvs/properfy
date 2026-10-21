import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AppointmentStatus, paths } from '@properfy/shared';

type TransitionBody = NonNullable<
  paths['/v1/appointments/{appointmentId}/status-transitions']['post']['requestBody']
>['content']['application/json'];

export interface UseAppointmentTransitionReturn {
  transition: (
    targetStatus: AppointmentStatus,
    reason?: string,
    reasonCode?: string,
    notifyRentalTenant?: boolean,
  ) => void;
  isTransitioning: boolean;
}

export function useAppointmentTransition(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseAppointmentTransitionReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation({
    mutationFn: async (body: TransitionBody) => {
      const { data, error, response } = await api.POST(
        '/v1/appointments/{appointmentId}/status-transitions',
        {
          params: { path: { appointmentId: appointmentId! } },
          body,
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        },
      );
      // 200-only route: openapi-fetch types `error`/`response` as `never` in the
      // (runtime-reachable) error branch, so read the status through a typed cast.
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
    },
  });

  const transition = (
    targetStatus: AppointmentStatus,
    reason?: string,
    reasonCode?: string,
    notifyRentalTenant?: boolean,
  ) => {
    if (!appointmentId) return;
    const body: TransitionBody = { targetStatus, reason };
    if (reasonCode) {
      // reasonCode arrives as a plain string from the UI selects; the backend
      // validates it against the enum, so narrow it to the typed field here.
      if (targetStatus === 'CANCELLED') body.cancellationReasonCode = reasonCode as TransitionBody['cancellationReasonCode'];
      if (targetStatus === 'REJECTED') body.rejectionReasonCode = reasonCode as TransitionBody['rejectionReasonCode'];
    }
    // Only meaningful for a cancellation; omitted elsewhere to keep the payload honest.
    if (targetStatus === 'CANCELLED' && notifyRentalTenant !== undefined) {
      body.notifyRentalTenant = notifyRentalTenant;
    }
    mutation.mutate(
      body,
      {
        onSuccess: () => {
          showSuccess('Transition completed');
          onSuccess?.();
        },
        onError: (err: Error) => {
          showError(err.message || 'Transition failed');
        },
      },
    );
  };

  return {
    transition,
    isTransitioning: mutation.isPending,
  };
}
