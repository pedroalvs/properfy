import { Link } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import type { MyInspectorNotice } from '@properfy/shared';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeNoticeDate } from '../lib/format-relative';

interface AnnouncementListItemProps {
  notice: MyInspectorNotice;
  timeZone: string;
  now?: Date;
}

/**
 * A single announcement row in the inbox. Unread notices carry a blue dot and a
 * bold title, and fold "unread" into the link's accessible name. The "Critical"
 * chip is read as text; the dot is decorative.
 */
export function AnnouncementListItem({ notice, timeZone, now }: AnnouncementListItemProps) {
  const unread = notice.readAt == null;
  return (
    <li role="listitem">
      <Link
        to={`/profile/announcements/${notice.id}`}
        aria-label={unread ? `${notice.title}, unread` : notice.title}
        className={cn(
          'flex touch-manipulation flex-col gap-1 rounded-card border border-border bg-card p-4 shadow-sm',
          'transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
            <span className={cn('truncate text-[15px] text-foreground', unread ? 'font-bold' : 'font-semibold')}>
              {notice.title}
            </span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeNoticeDate(notice.publishedAt, now, timeZone)}
          </span>
        </div>
        {notice.critical && (
          <Badge tone="red" className="self-start">
            Critical
          </Badge>
        )}
        <p className="line-clamp-2 text-sm text-muted-foreground">{notice.body}</p>
      </Link>
    </li>
  );
}
