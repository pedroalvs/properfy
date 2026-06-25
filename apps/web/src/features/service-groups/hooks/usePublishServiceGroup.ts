import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UsePublishServiceGroupReturn {
  publish: () => void;
  isPublishing: boolean;
}

export function usePublishServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UsePublishServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/publish`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const publish = () => {
    if (!serviceGroupId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('Service group published');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to publish service group');
        },
      },
    );
  };

  return {
    publish,
    isPublishing: mutation.isPending,
  };
}
