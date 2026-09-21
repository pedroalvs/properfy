import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseServiceRegionReactivateReturn {
  reactivate: (reason: string) => void;
  isReactivating: boolean;
}

/**
 * Reactivates an INACTIVE service region via the dedicated endpoint. Mirrors
 * useServiceRegionDeactivate — status transitions go through their own reason +
 * audit action, never through PATCH (#387).
 */
export function useServiceRegionReactivate(
  regionId: string | null,
  onSuccess?: () => void,
): UseServiceRegionReactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-regions/${regionId}/reactivate`,
    [['service-regions']],
  );

  const reactivate = (reason: string) => {
    if (!regionId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Service region reactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to reactivate service region');
        },
      },
    );
  };

  return {
    reactivate,
    isReactivating: mutation.isPending,
  };
}
