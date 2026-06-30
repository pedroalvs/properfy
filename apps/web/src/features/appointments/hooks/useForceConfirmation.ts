import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseForceConfirmationReturn {
  forceConfirm: (reason: string) => void;
  isForcing: boolean;
}

export function useForceConfirmation(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseForceConfirmationReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/appointments/${appointmentId}/force-confirmation`,
    [['appointments'], ['appointments', appointmentId]],
  );

  const forceConfirm = (reason: string) => {
    if (!appointmentId) return;
    mutation.mutate(
      { rentalTenantConfirmationStatus: 'CONFIRMED', reason },
      {
        onSuccess: () => {
          showSuccess('Tenant confirmation forced');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to force confirmation');
        },
      },
    );
  };

  return {
    forceConfirm,
    isForcing: mutation.isPending,
  };
}
