import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseInspectorDeactivateReturn {
  deactivate: (reason: string) => void;
  isDeactivating: boolean;
}

export function useInspectorDeactivate(
  inspectorId: string | null,
  onSuccess?: () => void,
): UseInspectorDeactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/inspectors/${inspectorId}/deactivate`,
    [['inspectors'], ['inspectors', inspectorId]],
  );

  const deactivate = (reason: string) => {
    if (!inspectorId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Inspector deactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to deactivate inspector');
        },
      },
    );
  };

  return {
    deactivate,
    isDeactivating: mutation.isPending,
  };
}
