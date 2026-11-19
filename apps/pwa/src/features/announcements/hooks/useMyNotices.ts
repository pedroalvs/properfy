import { useInfiniteQuery } from '@tanstack/react-query';
import type { MyInspectorNotice } from '@properfy/shared';
import { apiGet } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';

export interface MyNoticesPage {
  data: MyInspectorNotice[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

/**
 * The inspector's announcements inbox (own, non-archived notices), paginated
 * with a "Load more" affordance. Shares the `['inspector-notices']` key prefix
 * so the unread-count invalidation after mark-read / SW push also refreshes the
 * list.
 */
export function useMyNotices() {
  return useInfiniteQuery<MyNoticesPage, ApiError>({
    queryKey: ['inspector-notices', 'list'],
    queryFn: ({ pageParam }) =>
      apiGet<MyNoticesPage>('/v1/inspectors/me/notices', {
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
  });
}
