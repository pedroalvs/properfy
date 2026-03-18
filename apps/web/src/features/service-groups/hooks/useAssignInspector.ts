import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseAssignInspectorReturn {
  assign: (inspectorId: string) => void;
  isAssigning: boolean;
}

export function useAssignInspector(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseAssignInspectorReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/assign`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const assign = (inspectorId: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      { inspectorId },
      {
        onSuccess: () => {
          showSuccess('Inspector assigned');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to assign inspector');
        },
      },
    );
  };

  return {
    assign,
    isAssigning: mutation.isPending,
  };
}
