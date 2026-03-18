import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AppointmentStatus } from '@properfy/shared';

export interface UseAppointmentTransitionReturn {
  transition: (targetStatus: AppointmentStatus, reason?: string) => void;
  isTransitioning: boolean;
}

export function useAppointmentTransition(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseAppointmentTransitionReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/appointments/${appointmentId}/status-transitions`,
    [['appointments'], ['appointments', appointmentId]],
  );

  const transition = (targetStatus: AppointmentStatus, reason?: string) => {
    if (!appointmentId) return;
    mutation.mutate(
      { targetStatus, reason },
      {
        onSuccess: () => {
          showSuccess('Transition completed');
          onSuccess?.();
        },
        onError: (err) => {
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
