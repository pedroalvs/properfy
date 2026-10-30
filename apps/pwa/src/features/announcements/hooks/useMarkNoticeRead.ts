import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { INSPECTOR_NOTICES_KEY } from './useUnreadNoticeCount';

interface MarkReadResult {
  noticeId: string;
  readAt: string;
}

/**
 * Marks a notice read. On success it invalidates the `['inspector-notices']`
 * tree so the inbox list and the unread badge both refresh.
 */
export function useMarkNoticeRead() {
  const queryClient = useQueryClient();
  return useMutation<SuccessResponse<MarkReadResult>, ApiError, string>({
    mutationFn: (noticeId: string) =>
      apiPost<SuccessResponse<MarkReadResult>>(`/v1/inspectors/me/notices/${noticeId}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSPECTOR_NOTICES_KEY });
    },
  });
}
