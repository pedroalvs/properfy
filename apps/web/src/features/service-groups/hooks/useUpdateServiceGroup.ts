import { useUpdateMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UpdateServiceGroupData {
  serviceRegionId?: string | null;
  description?: string;
  scheduledDate?: string;
  timeWindow?: string;
  priorityMode?: 'STANDARD' | 'PRIORITY_24H';
  actorTimezone?: string;
}

export interface UseUpdateServiceGroupReturn {
  update: (data: UpdateServiceGroupData) => void;
  isUpdating: boolean;
}

export function useUpdateServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseUpdateServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useUpdateMutation<UpdateServiceGroupData>(
    `/v1/service-groups/${serviceGroupId}`,
    [['service-groups'], ['service-groups', serviceGroupId]],
  );

  const update = (data: UpdateServiceGroupData) => {
    if (!serviceGroupId) return;
    mutation.mutate(data, {
      onSuccess: () => {
        showSuccess('Service group updated');
        onSuccess?.();
      },
      onError: (err) => {
        showError(err.message || 'Failed to update service group');
      },
    });
  };

  return {
    update,
    isUpdating: mutation.isPending,
  };
}
