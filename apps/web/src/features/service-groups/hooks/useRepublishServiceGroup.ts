import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseRepublishServiceGroupReturn {
  republish: (reason?: string) => void;
  isRepublishing: boolean;
}

export function useRepublishServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseRepublishServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/republish`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const republish = (reason?: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      reason ? { reason } : {},
      {
        onSuccess: () => {
          showSuccess('Service group republished');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to republish service group');
        },
      },
    );
  };

  return {
    republish,
    isRepublishing: mutation.isPending,
  };
}
