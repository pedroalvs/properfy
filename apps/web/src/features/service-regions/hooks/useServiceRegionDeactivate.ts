import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseServiceRegionDeactivateReturn {
  deactivate: (reason: string) => void;
  isDeactivating: boolean;
}

export function useServiceRegionDeactivate(
  regionId: string | null,
  onSuccess?: () => void,
): UseServiceRegionDeactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-regions/${regionId}/deactivate`,
    [['service-regions']],
  );

  const deactivate = (reason: string) => {
    if (!regionId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Service region deactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to deactivate service region');
        },
      },
    );
  };

  return {
    deactivate,
    isDeactivating: mutation.isPending,
  };
}
