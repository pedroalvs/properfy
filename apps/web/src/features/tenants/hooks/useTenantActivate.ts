import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseTenantActivateReturn {
  activate: () => void;
  isActivating: boolean;
}

export function useTenantActivate(
  tenantId: string | null,
  onSuccess?: () => void,
): UseTenantActivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/tenants/${tenantId}/activate`,
    [['tenant-admins'], ['tenant-admins', tenantId]],
  );

  const activate = () => {
    if (!tenantId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('Agency activated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to activate agency');
        },
      },
    );
  };

  return {
    activate,
    isActivating: mutation.isPending,
  };
}
