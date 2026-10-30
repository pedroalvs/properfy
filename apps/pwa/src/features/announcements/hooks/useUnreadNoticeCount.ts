import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListQuery, type SuccessResponse } from '@/hooks/useApiQuery';

export const INSPECTOR_NOTICES_KEY = ['inspector-notices'] as const;
export const UNREAD_COUNT_KEY = ['inspector-notices', 'unread-count'] as const;

/**
 * The single source of the unread badge (Profile tab + Announcements tile).
 * Reads `/unread-count` only (the list never carries a count). Refetches on
 * window focus and invalidates the whole `['inspector-notices']` tree when the
 * service worker reports a freshly received push, so the badge updates while
 * the app is open.
 */
export function useUnreadNoticeCount() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    if (!container) return;
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'inspector-notice:received') {
        void queryClient.invalidateQueries({ queryKey: INSPECTOR_NOTICES_KEY });
      }
    };
    container.addEventListener('message', handler);
    return () => container.removeEventListener('message', handler);
  }, [queryClient]);

  const query = useListQuery<SuccessResponse<{ count: number }>>(
    UNREAD_COUNT_KEY as unknown as unknown[],
    '/v1/inspectors/me/notices/unread-count',
    undefined,
    { staleTime: 30_000, refetchOnWindowFocus: true },
  );

  return { ...query, count: query.data?.data.count ?? 0 };
}
