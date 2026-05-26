import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatDateTime } from '@/lib/format-date';
import { usePortalActivities } from '../hooks/usePortalActivities';

interface AppointmentPortalActivityTabProps {
  appointmentId: string;
}

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  CONFIRMED: { bg: '#C8E6C9', text: '#2E7D32', icon: 'mdi-check-circle' },
  RESCHEDULED: { bg: '#B3E5FC', text: '#0277BD', icon: 'mdi-calendar-clock' },
  CONTACT_UPDATED: { bg: '#FFE0B2', text: '#E65100', icon: 'mdi-account-edit' },
  UNAVAILABLE: { bg: '#FFCDD2', text: '#C62828', icon: 'mdi-calendar-remove' },
  GROUP_JOIN: { bg: '#E8F5E9', text: '#388E3C', icon: 'mdi-account-group' },
};

function GroupJoinSummary({ values }: { values: Record<string, string> }) {
  return (
    <p className="mt-0.5 text-xs text-text-secondary">
      {values.scheduledDate} {values.timeSlot}
    </p>
  );
}

function formatActionLabel(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppointmentPortalActivityTab({ appointmentId }: AppointmentPortalActivityTabProps) {
  const { activities, isLoading, isError, refetch } = usePortalActivities(appointmentId);

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  if (isError) {
    return <ErrorState message="Failed to load portal activities" onRetry={refetch} />;
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        title="No portal activity"
        description="No tenant portal interactions have been recorded yet."
        icon="mdi-account-clock-outline"
      />
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3 rounded border border-black/5 bg-app-bg p-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: ACTION_COLORS[activity.action]?.bg ?? '#E0E0E0' }}
          >
            <i
              className={`mdi ${ACTION_COLORS[activity.action]?.icon ?? 'mdi-account'} text-base`}
              style={{ color: ACTION_COLORS[activity.action]?.text ?? '#333' }}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">
                {formatActionLabel(activity.action)}
              </span>
              <span className="text-xs text-text-muted">
                {formatDateTime(activity.createdAt)}
              </span>
            </div>
            {activity.action === 'GROUP_JOIN' && !!activity.newValuesJson && (
              <GroupJoinSummary values={activity.newValuesJson as Record<string, string>} />
            )}
            {(activity.ipAddress || activity.userAgent) && (
              <p className="mt-1 truncate text-xs text-text-muted">
                {activity.ipAddress && <span>IP: {activity.ipAddress}</span>}
                {activity.ipAddress && activity.userAgent && <span> · </span>}
                {activity.userAgent && <span>{activity.userAgent}</span>}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
