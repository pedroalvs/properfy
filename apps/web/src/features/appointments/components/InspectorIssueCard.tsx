import { cn } from '@properfy/frontend-standards';
import type { InspectorIssue } from '@properfy/shared';
import { formatInstantDateTime } from '@/lib/format-date';
import { formatFieldIssueReason } from '../lib/field-event-format';

interface InspectorIssueCardProps {
  /** Latest CANT_DO field event; the card renders nothing when null/undefined. */
  issue: InspectorIssue | null | undefined;
  /**
   * The appointment's currently-assigned inspector. When it matches the issue's
   * `inspectorId`, the reporter line gains a "(current inspector)" suffix so the
   * operator can tell the impediment is from the inspector on the job now, not a
   * previous one before a re-offer (L-F03-09).
   */
  currentInspectorId?: string | null;
  /** `full` on the appointment detail; `compact` inside the map detail popup. */
  variant?: 'full' | 'compact';
  'data-testid'?: string;
}

/**
 * "Inspector couldn't complete" card — surfaces the last `CANT_DO` field event
 * (reason, note, reporter, time). Never renders any inspector coordinate; the
 * `InspectorIssue` contract carries none. Shown on the appointment detail and,
 * in its compact form, inside the map detail popup. The compact variant is
 * inline content only — it never opens a modal of its own (a modal launched from
 * inside the Mapbox popup is killed by the popup's outside-click handling).
 */
export function InspectorIssueCard({
  issue,
  currentInspectorId,
  variant = 'full',
  'data-testid': dataTestId,
}: InspectorIssueCardProps) {
  if (!issue) return null;

  const reporter = issue.inspectorName ?? 'Inspector';
  const isCurrentInspector =
    !!issue.inspectorId && !!currentInspectorId && issue.inspectorId === currentInspectorId;
  const reporterLine = `Reported by ${reporter}${
    isCurrentInspector ? ' (current inspector)' : ''
  } on ${formatInstantDateTime(issue.occurredAt)}`;

  return (
    <div
      role="status"
      data-testid={dataTestId}
      className={cn(
        'rounded border-l-4 border-l-warning bg-warning/5',
        variant === 'compact' ? 'px-3 py-2' : 'p-4',
      )}
    >
      <div className="flex items-start gap-2">
        <i
          className={cn('mdi mdi-account-alert mt-0.5 flex-shrink-0 text-warning', variant === 'compact' ? 'text-base' : 'text-lg')}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className={cn('font-semibold text-text-primary', variant === 'compact' ? 'text-sm' : 'text-base')}>
            Inspector couldn&apos;t complete
          </p>
          <p className={cn('mt-0.5 text-text-secondary', variant === 'compact' ? 'text-xs' : 'text-sm')}>
            Reason: {formatFieldIssueReason(issue.reason)}
          </p>
          {issue.note && (
            <p
              className={cn(
                'mt-0.5 whitespace-pre-wrap break-words text-text-secondary',
                variant === 'compact' ? 'line-clamp-2 text-xs' : 'text-sm',
              )}
              title={variant === 'compact' ? issue.note : undefined}
            >
              Note: {issue.note}
            </p>
          )}
          <p className={cn('mt-0.5 text-text-muted', variant === 'compact' ? 'text-xs' : 'text-xs')}>
            {reporterLine}
          </p>
        </div>
      </div>
    </div>
  );
}
