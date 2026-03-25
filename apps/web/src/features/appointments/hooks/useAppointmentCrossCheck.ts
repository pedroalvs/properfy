import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseAppointmentCrossCheckReturn {
  crossCheckDone: () => void;
  isCrossChecking: boolean;
}

export function useAppointmentCrossCheck(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseAppointmentCrossCheckReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        `/v1/appointments/${appointmentId}/cross-check-done` as any,
        { body: {} as any },
      );
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Cross-check failed');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
    },
  });

  const crossCheckDone = () => {
    if (!appointmentId) return;
    mutation.mutate(undefined, {
      onSuccess: () => {
        showSuccess('Appointment validated and released for financial processing.');
        onSuccess?.();
      },
      onError: (err: Error) => {
        showError(err.message || 'Cross-check failed');
      },
    });
  };

  return {
    crossCheckDone,
    isCrossChecking: mutation.isPending,
  };
}
