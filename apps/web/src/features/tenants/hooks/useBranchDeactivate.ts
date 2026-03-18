import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseBranchDeactivateReturn {
  deactivate: () => void;
  isDeactivating: boolean;
}

export function useBranchDeactivate(
  tenantId: string | null,
  branchId: string | null,
  onSuccess?: () => void,
): UseBranchDeactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/tenants/${tenantId}/branches/${branchId}/deactivate`,
    [['tenant-admins', tenantId, 'branches']],
  );

  const deactivate = () => {
    if (!tenantId || !branchId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('Branch deactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to deactivate branch');
        },
      },
    );
  };

  return {
    deactivate,
    isDeactivating: mutation.isPending,
  };
}
