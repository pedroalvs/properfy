import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseCancelServiceGroupReturn {
  cancel: (reason: string) => void;
  isCancelling: boolean;
}

export function useCancelServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseCancelServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/cancel`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const cancel = (reason: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Service group cancelled');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to cancel service group');
        },
      },
    );
  };

  return {
    cancel,
    isCancelling: mutation.isPending,
  };
}
