import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { PropertyIssueSource, type PropertyIssueResponse } from '@properfy/shared';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { issueOriginLabel, issuePhotosLabel } from '../lib/property-file-view';
import { useFileDownload } from '../hooks/useFileDownload';

const SOURCE_TONE: Record<PropertyIssueSource, 'blue' | 'gray' | 'amber'> = {
  [PropertyIssueSource.INSPECTOR]: 'blue',
  [PropertyIssueSource.STAFF]: 'gray',
  [PropertyIssueSource.RENTAL_TENANT_PORTAL]: 'amber',
};

interface IssueCardProps {
  issue: PropertyIssueResponse;
}

/**
 * One issue, read-only: reason, origin badge and date, plus its photos as tappable
 * tiles (open the signed URL — HEIC that the browser can't preview still downloads,
 * D13). The author is masked server-side for the inspector, so it is never shown;
 * mark-as-seen is web-only and absent here.
 */
export function IssueCard({ issue }: IssueCardProps) {
  const timeZone = useEffectiveTimezone();
  const { openFile, pendingId, error } = useFileDownload();

  const origin = issueOriginLabel(issue.source);
  const createdAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(issue.createdAt));

  const noPhotosLabel = issuePhotosLabel(issue);

  return (
    <Card data-testid={`issue-card-${issue.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={SOURCE_TONE[issue.source]}>{origin}</Badge>
        <span className="text-xs text-muted-foreground">{createdAt}</span>
      </div>
      <p className="whitespace-pre-line break-words text-sm text-foreground">{issue.reason}</p>

      {error && (
        <Alert tone="destructive" data-testid="issue-photo-error">
          <span>{error}</span>
        </Alert>
      )}

      {noPhotosLabel ? (
        <p className="text-xs italic text-muted-foreground">{noPhotosLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {issue.photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => openFile(photo.id)}
              disabled={pendingId === photo.id}
              data-testid={`issue-photo-${photo.id}`}
              className="flex min-h-touch items-center gap-1.5 rounded-card border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
            >
              {pendingId === photo.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              Photo {index + 1}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
