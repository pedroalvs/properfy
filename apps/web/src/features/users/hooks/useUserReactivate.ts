import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { UserScope } from '../types';

export interface UseUserReactivateReturn {
  reactivate: () => void;
  isReactivating: boolean;
}

export function useUserReactivate(
  userId: string | null,
  tenantId: string | undefined,
  scope: UserScope,
  onSuccess?: () => void,
): UseUserReactivateReturn {
  const { showSuccess, showError } = useSnackbar();

  const path =
    scope === 'internal'
      ? `/v1/users/${userId}/reactivate`
      : `/v1/tenants/${tenantId}/users/${userId}/reactivate`;

  const mutation = useActionMutation(path, [['users']]);

  const reactivate = () => {
    if (!userId) return;
    if (scope === 'tenant' && !tenantId) return;
    mutation.mutate(
      {},
      {
        onSuccess: () => {
          showSuccess('User reactivated successfully');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to reactivate user');
        },
      },
    );
  };

  return {
    reactivate,
    isReactivating: mutation.isPending,
  };
}
