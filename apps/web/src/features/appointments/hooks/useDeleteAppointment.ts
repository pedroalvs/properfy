import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface UseDeleteAppointmentReturn {
  remove: () => void;
  isDeleting: boolean;
}

export function useDeleteAppointment(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseDeleteAppointmentReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE(
        `/v1/appointments/${appointmentId}` as never,
      );
      if (error) {
        const apiError = error as { status?: number; message?: string; error?: { message?: string } };
        throw new ApiError(
          apiError.status ?? 500,
          apiError.error?.message ?? apiError.message ?? 'Failed to delete appointment',
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      showSuccess('Appointment deleted');
      onSuccess?.();
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to delete appointment');
    },
  });

  const remove = () => {
    if (!appointmentId) return;
    mutation.mutate();
  };

  return { remove, isDeleting: mutation.isPending };
}
