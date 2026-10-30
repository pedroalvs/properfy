import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseArchiveInspectorNoticeReturn {
  archive: () => void;
  isArchiving: boolean;
  error: ApiError | null;
}

/**
 * Archives a notice (idempotent — an already-archived notice returns 200). On
 * success both the list and this notice's detail are invalidated so the UI
 * reflects the archived state.
 */
export function useArchiveInspectorNotice(
  id: string | null,
  onArchived?: () => void,
): UseArchiveInspectorNoticeReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, ApiError, void>({
    mutationFn: async () => {
      const { error, response } = await api.POST('/v1/inspector-notices/{noticeId}/archive', {
        params: { path: { noticeId: id ?? '' } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector-notices'] });
      onArchived?.();
    },
  });

  return {
    archive: () => mutation.mutate(),
    isArchiving: mutation.isPending,
    error: mutation.error,
  };
}
