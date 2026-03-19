import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AppointmentStatus } from '@properfy/shared';

export interface UseAppointmentTransitionReturn {
  transition: (targetStatus: AppointmentStatus, reason?: string, reasonCode?: string) => void;
  isTransitioning: boolean;
}

export function useAppointmentTransition(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseAppointmentTransitionReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation({
    mutationFn: async (body: { targetStatus: AppointmentStatus; reason?: string; cancellationReasonCode?: string; rejectionReasonCode?: string }) => {
      const { data, error } = await api.POST(
        `/v1/appointments/${appointmentId}/status-transitions` as any,
        {
          body: body as any,
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        },
      );
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Transition failed');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
    },
  });

  const transition = (targetStatus: AppointmentStatus, reason?: string, reasonCode?: string) => {
    if (!appointmentId) return;
    const body: Parameters<typeof mutation.mutate>[0] = { targetStatus, reason };
    if (reasonCode) {
      if (targetStatus === 'CANCELLED') body.cancellationReasonCode = reasonCode;
      if (targetStatus === 'REJECTED') body.rejectionReasonCode = reasonCode;
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
