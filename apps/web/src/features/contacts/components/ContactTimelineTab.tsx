import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatDateTime } from '@/lib/format-date';
import { useContactTimeline } from '../hooks/useContactTimeline';

const CONTACT_ACTION_LABELS: Record<string, string> = {
  'contact.created': 'Contact created',
  'contact.updated': 'Contact updated',
  'contact.deactivated': 'Contact deactivated',
  'contact.reactivated': 'Contact reactivated',
};

const CONTACT_ACTION_STYLES: Record<string, { icon: string; color: string }> = {
  'contact.created':     { icon: 'mdi-plus-circle',  color: 'border-success' },
  'contact.updated':     { icon: 'mdi-pencil',       color: 'border-info' },
  'contact.deactivated': { icon: 'mdi-archive',      color: 'border-warning' },
  'contact.reactivated': { icon: 'mdi-restore',      color: 'border-success' },
};

interface ContactTimelineTabProps {
  contactId: string;
  /** Lazy fetch: tab activates this only when visible (NFR-103/104). */
  enabled?: boolean;
}

export function ContactTimelineTab({ contactId, enabled }: ContactTimelineTabProps) {
  const { entries, isLoading, isError, refetch } = useContactTimeline(contactId, { enabled });

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load audit log" onRetry={refetch} />;

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No audit entries"
        description="No events have been recorded for this contact yet."
        icon="mdi-timeline-outline"
      />
    );
  }

  return (
    <ol className="relative ms-3 border-s border-default">
      {entries.map((entry) => {
        const label = CONTACT_ACTION_LABELS[entry.action] ?? entry.action;
        const style = CONTACT_ACTION_STYLES[entry.action] ?? { icon: 'mdi-information-outline', color: 'border-default' };
        return (
          <li key={entry.id} className={`mb-6 ms-6 ps-4 ${style.color}`}>
            <span className="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-surface ring-2 ring-default">
              <i className={`mdi ${style.icon} text-base`} aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{label}</span>
                <time className="text-xs text-muted">{formatDateTime(entry.createdAt)}</time>
              </div>
              <span className="text-sm text-muted">
                by {entry.actorName ?? entry.actorType}
              </span>
              {entry.reason ? (
                <span className="mt-1 text-sm text-default">{entry.reason}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
