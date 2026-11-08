import type { PropertyIssueResponse } from '@properfy/shared';
import { formatInstantDateTime } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui';
import { issueSourceLabel, issueSeenStatus, ISSUE_NO_PHOTOS_TEXT } from '../lib/issue-format';

export interface PropertyIssueCardProps {
  issue: PropertyIssueResponse;
  currentUserId: string | null;
  /** Property context: resolved appointment code for `issue.appointmentId`. */
  appointmentCode?: string | null;
  onOpenAppointment?: (appointmentId: string) => void;
  /** Open an issue photo (fresh signed URL → new tab). */
  onOpenPhoto: (fileId: string) => void;
  openingPhotoId?: string | null;
  /** Mark as seen (AM/OP/CL_ADMIN). */
  onMarkSeen?: () => void;
  markingSeen?: boolean;
  /** Delete the issue (AM/OP). */
  onDelete?: () => void;
}

export function PropertyIssueCard({
  issue,
  currentUserId,
  appointmentCode,
  onOpenAppointment,
  onOpenPhoto,
  openingPhotoId,
  onMarkSeen,
  markingSeen,
  onDelete,
}: PropertyIssueCardProps) {
  const seen = issueSeenStatus(issue, currentUserId);

  return (
    <div
      className={cn(
        'rounded border bg-card-bg p-4',
        seen.seen ? 'border-border-subtle' : 'border-l-4 border-l-warning border-y-border-subtle border-r-border-subtle',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-info/10 px-1.5 py-0.5 text-xs font-semibold text-info">
            {issueSourceLabel(issue.source)}
          </span>
          <span className="text-xs text-text-secondary">{formatInstantDateTime(issue.createdAt)}</span>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete issue"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-error hover:bg-error/10"
          >
            <i className="mdi mdi-delete-outline" aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{issue.reason}</p>

      {issue.appointmentId && onOpenAppointment && (
        <button
          type="button"
          onClick={() => onOpenAppointment(issue.appointmentId!)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <i className="mdi mdi-calendar-outline" aria-hidden="true" />
          {appointmentCode ? `Appointment #${appointmentCode}` : 'Open appointment'}
        </button>
      )}

      <div className="mt-3">
        {issue.photos.length === 0 ? (
          <p className="text-xs italic text-text-secondary">{ISSUE_NO_PHOTOS_TEXT}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {issue.photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => onOpenPhoto(photo.id)}
                  disabled={openingPhotoId === photo.id}
                  aria-label={`Open photo ${photo.fileName}`}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded border border-border-subtle text-text-secondary hover:bg-black/5 disabled:opacity-40"
                >
                  <i
                    className={cn(
                      'mdi text-xl',
                      openingPhotoId === photo.id ? 'mdi-loading mdi-spin' : 'mdi-file-image-outline',
                    )}
                    aria-hidden="true"
                  />
                  <span className="mdi mdi-open-in-new text-[10px]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        {seen.seen ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <i className="mdi mdi-check-circle-outline" aria-hidden="true" />
            {seen.label}
          </span>
        ) : onMarkSeen ? (
          <Button variant="secondary" onClick={onMarkSeen} loading={markingSeen} disabled={markingSeen}>
            Mark as seen
          </Button>
        ) : (
          <span className="text-xs font-semibold text-warning">Not seen</span>
        )}
      </div>
    </div>
  );
}
