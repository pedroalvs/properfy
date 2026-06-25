import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseRejectServiceGroupReturn {
  reject: (reason: string) => void;
  isRejecting: boolean;
}

export function useRejectServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseRejectServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/reject`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const reject = (reason: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Service group rejected');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to reject service group');
        },
      },
    );
  };

  return {
    reject,
    isRejecting: mutation.isPending,
  };
}
