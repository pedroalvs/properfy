import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MyInspectorNotice } from '@properfy/shared';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useDetailQuery } from '@/hooks/useApiQuery';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { useMarkNoticeRead } from '../hooks/useMarkNoticeRead';
import { formatFullNoticeDate } from '../lib/format-relative';

export function AnnouncementDetailPage() {
  const { noticeId = '' } = useParams();
  const navigate = useNavigate();
  const timeZone = useEffectiveTimezone();
  const markRead = useMarkNoticeRead();
  const markedRef = useRef<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useDetailQuery<MyInspectorNotice>(
    ['inspector-notices', 'detail', noticeId],
    `/v1/inspectors/me/notices/${noticeId}`,
    { enabled: noticeId !== '' },
  );

  const notice = data?.data;

  // Mark read exactly once per notice per mount (StrictMode double-invokes effects):
  // guard on the notice id so the POST does not fire twice.
  useEffect(() => {
    if (notice && notice.readAt == null && markedRef.current !== notice.id) {
      markedRef.current = notice.id;
      markRead.mutate(notice.id);
    }
  }, [notice, markRead]);

  if (isLoading) {
    return (
      <div className="w-full pb-20">
        <TopBar title="Announcement" showBack backTo="/profile/announcements" backHideOnWide />
        <div className="px-page-x">
          <LoadingState rows={2} />
        </div>
      </div>
    );
  }

  if (isError) {
    const notFound = error?.status === 404;
    return (
      <div className="w-full pb-20">
        <TopBar title="Announcement" showBack backTo="/profile/announcements" backHideOnWide />
        <div className="px-page-x">
          {notFound ? (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-base font-semibold text-foreground">
                This announcement is no longer available.
              </p>
              <div className="mt-4">
                <Button variant="outlined" onClick={() => navigate('/profile/announcements')}>
                  Back to announcements
                </Button>
              </div>
            </div>
          ) : (
            <ErrorState
              message="Couldn't load this announcement."
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  if (!notice) return null;

  return (
    <div className="w-full pb-20">
      <TopBar title="Announcement" showBack backTo="/profile/announcements" backHideOnWide />
      <article className="flex flex-col gap-3 px-page-x">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{notice.title}</h1>
        <div className="flex items-center gap-2">
          {notice.critical && <Badge tone="red">Critical</Badge>}
          <span className="text-sm text-muted-foreground">
            {formatFullNoticeDate(notice.publishedAt, timeZone)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
          {notice.body}
        </p>
      </article>
    </div>
  );
}
