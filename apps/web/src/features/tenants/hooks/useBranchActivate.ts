import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseBranchActivateReturn {
  activate: () => void;
  isActivating: boolean;
}

export function useBranchActivate(
  tenantId: string | null,
  branchId: string | null,
  onSuccess?: () => void,
): UseBranchActivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/tenants/${tenantId}/branches/${branchId}/activate`,
    [['tenant-admins', tenantId, 'branches']],
  );

  const activate = () => {
    if (!tenantId || !branchId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('Branch activated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to activate branch');
        },
      },
    );
  };

  return {
    activate,
    isActivating: mutation.isPending,
  };
}
