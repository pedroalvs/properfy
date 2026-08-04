import { RentalTenantPortalAction, type AvailableSlot } from '@properfy/shared';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { getErrorMessage } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { usePortalActivities } from '../hooks/usePortalActivities';
import { TenantAvailabilitySlots } from './TenantAvailabilitySlots';

interface AppointmentPortalActivityTabProps {
  appointmentId: string;
}

/**
 * Keyed on RentalTenantPortalAction so a future enum change fails typecheck instead of
 * silently degrading to the grey fallback — which is exactly how CONFIRMED/RESCHEDULED/
 * UNAVAILABLE (values the backend never emits) went unnoticed here.
 */
type ActionStyle = { bg: string; text: string; icon: string };

const ACTION_COLORS: Record<RentalTenantPortalAction, ActionStyle> = {
  VIEW: { bg: '#CFD8DC', text: '#455A64', icon: 'mdi-eye' },
  CONFIRM: { bg: '#C8E6C9', text: '#2E7D32', icon: 'mdi-check-circle' },
  RESCHEDULE: { bg: '#B3E5FC', text: '#0277BD', icon: 'mdi-calendar-clock' },
  CONTACT_UPDATED: { bg: '#FFE0B2', text: '#E65100', icon: 'mdi-account-edit' },
  UNAVAILABLE_REPORTED: { bg: '#FFCDD2', text: '#C62828', icon: 'mdi-calendar-remove' },
  GROUP_JOIN: { bg: '#E8F5E9', text: '#388E3C', icon: 'mdi-account-group' },
  // #F57F17 on this background is 2.5:1 — unreadable. #7A4F01 is 6.7:1.
  SURVEY_SUBMITTED: { bg: '#FFF8E1', text: '#7A4F01', icon: 'mdi-star' },
};

/** `action` arrives as a plain string from the API; unknown values keep a neutral badge. */
const UNKNOWN_ACTION_STYLE: ActionStyle = { bg: '#E0E0E0', text: '#333', icon: 'mdi-account' };

function actionStyle(action: string) {
  return ACTION_COLORS[action as RentalTenantPortalAction] ?? UNKNOWN_ACTION_STYLE;
}

function GroupJoinSummary({ values }: { values: Record<string, string> }) {
  return (
    <p className="mt-0.5 text-xs text-text-secondary">
      {values.scheduledDate} {values.timeSlot}
    </p>
  );
}

function UnavailableSummary({ values }: { values: Record<string, unknown> }) {
  const slots = values['availableSlotsJson'] as AvailableSlot[] | undefined;
  if (!slots?.length) return null;
  return (
    <div className="mt-1">
      <p className="mb-1 text-xs text-text-secondary">Availability offered</p>
      <TenantAvailabilitySlots slots={slots} />
    </div>
  );
}

function formatActionLabel(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppointmentPortalActivityTab({ appointmentId }: AppointmentPortalActivityTabProps) {
  const { activities, isLoading, isError, error, refetch } = usePortalActivities(appointmentId);

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  if (isError) {
    return (
      <ErrorState
        message="Failed to load portal activities"
        detail={getErrorMessage(error)}
        onRetry={refetch}
      />
    );
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
      {activities.map((activity) => {
        const style = actionStyle(activity.action);
        return (
          <div key={activity.id} className="flex gap-3 rounded border border-black/5 bg-app-bg p-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: style.bg }}
            >
              <i
                className={`mdi ${style.icon} text-base`}
                style={{ color: style.text }}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  {formatActionLabel(activity.action)}
                </span>
                <span className="text-xs text-text-muted">
                  {formatInstantDateTime(activity.createdAt)}
                </span>
              </div>
              {activity.action === RentalTenantPortalAction.GROUP_JOIN &&
                !!activity.newValuesJson && (
                  <GroupJoinSummary values={activity.newValuesJson as Record<string, string>} />
                )}
              {activity.action === RentalTenantPortalAction.UNAVAILABLE_REPORTED &&
                !!activity.newValuesJson && (
                  <UnavailableSummary values={activity.newValuesJson as Record<string, unknown>} />
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
        );
      })}
    </div>
  );
}
