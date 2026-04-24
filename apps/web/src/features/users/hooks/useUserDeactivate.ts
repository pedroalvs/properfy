import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { UserScope } from '../types';

export interface UseUserDeactivateReturn {
  deactivate: () => void;
  isDeactivating: boolean;
}

export function useUserDeactivate(
  userId: string | null,
  tenantId: string | undefined,
  scope: UserScope,
  onSuccess?: () => void,
): UseUserDeactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const path =
    scope === 'internal'
      ? `/v1/users/${userId}/deactivate`
      : `/v1/tenants/${tenantId}/users/${userId}/deactivate`;

  const mutation = useActionMutation(path, [['users']]);

  const deactivate = () => {
    if (!userId) return;
    if (scope === 'tenant' && !tenantId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('User deactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to deactivate user');
        },
      },
    );
  };

  return {
    deactivate,
    isDeactivating: mutation.isPending,
  };
}
