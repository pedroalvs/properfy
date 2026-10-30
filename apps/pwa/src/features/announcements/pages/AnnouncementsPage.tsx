import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/Button';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { useMyNotices } from '../hooks/useMyNotices';
import { AnnouncementListItem } from '../components/AnnouncementListItem';

/**
 * The inspector's Announcements inbox (D11): own, non-archived notices in
 * backend order, with unread marking and relative dates. No pins, filters or
 * search; "Load more" paginates. Reading is marked on opening a notice, not
 * here.
 */
export function AnnouncementsPage() {
  const timeZone = useEffectiveTimezone();
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMyNotices();

  const notices = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="w-full pb-20">
      <TopBar title="Announcements" showBack backTo="/profile" backHideOnWide />
      <div className="px-page-x">
        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState
            message="Couldn't load announcements."
            retryLabel="Retry"
            onRetry={() => void refetch()}
          />
        ) : notices.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            description="Messages from the Properfy team will show up here."
          />
        ) : (
          <>
            <ul role="list" className="flex flex-col gap-3">
              {notices.map((notice) => (
                <AnnouncementListItem key={notice.id} notice={notice} timeZone={timeZone} />
              ))}
            </ul>
            {hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outlined"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
