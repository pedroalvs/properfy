import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { INSPECTOR_NOTICES_KEY } from './useUnreadNoticeCount';

interface MarkAllReadResult {
  count: number;
}

/**
 * Marks every unread announcement of the calling inspector read in one call. On
 * success it invalidates the `['inspector-notices']` tree so the inbox list and
 * the unread badge both refresh (the badge clears).
 */
export function useMarkAllNoticesRead() {
  const queryClient = useQueryClient();
  return useMutation<SuccessResponse<MarkAllReadResult>, ApiError, void>({
    mutationFn: () =>
      apiPost<SuccessResponse<MarkAllReadResult>>('/v1/inspectors/me/notices/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSPECTOR_NOTICES_KEY });
    },
  });
}
