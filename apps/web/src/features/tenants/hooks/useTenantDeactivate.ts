import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseTenantDeactivateReturn {
  deactivate: () => void;
  isDeactivating: boolean;
}

export function useTenantDeactivate(
  tenantId: string | null,
  onSuccess?: () => void,
): UseTenantDeactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/tenants/${tenantId}/deactivate`,
    [['tenant-admins'], ['tenant-admins', tenantId]],
  );

  const deactivate = () => {
    if (!tenantId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('Agency deactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to deactivate agency');
        },
      },
    );
  };

  return {
    deactivate,
    isDeactivating: mutation.isPending,
  };
}
