import { cn } from '@properfy/frontend-standards';
import { InspectorFieldEventType, type FieldEventItem, type ExecutionSummary } from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatInstantDateTime } from '@/lib/format-date';
import { getDisplayTimezone } from '@/lib/display-timezone';
import { useAppointmentFieldActivity } from '../hooks/useAppointmentFieldActivity';
import { formatFieldEventReason } from '../lib/field-event-format';

interface AppointmentFieldActivitySectionProps {
  appointmentId: string;
}

const DEVICE_TIME_DRIFT_MS = 2 * 60 * 1000;

/** `"120 m (accuracy ±8 m)"`, or `"Property has no coordinates"` when distance is null. */
function distanceLabel(distanceMeters: number | null, accuracyMeters: number | null): string {
  if (distanceMeters == null) return 'Property has no coordinates';
  const base = `${Math.round(distanceMeters)} m`;
  return accuracyMeters == null ? base : `${base} (accuracy ±${Math.round(accuracyMeters)} m)`;
}

/** Wall-clock HH:mm of an instant in the user's effective timezone (device-time note only). */
function wallClock(instant: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getDisplayTimezone(),
  }).format(new Date(instant));
}

/** "Device time HH:mm (synced later)" when the client clock diverged from the server by > 2 min. */
function deviceTimeNote(serverAt: string, clientAt: string | null): string | null {
  if (!clientAt) return null;
  const drift = Math.abs(new Date(serverAt).getTime() - new Date(clientAt).getTime());
  if (!Number.isFinite(drift) || drift <= DEVICE_TIME_DRIFT_MS) return null;
  return `Device time ${wallClock(clientAt)} (synced later)`;
}

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-block rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
      {children}
    </span>
  );
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  [InspectorFieldEventType.CANT_DO]: "Can't do this job",
  [InspectorFieldEventType.LATE_NOTICE]: 'Running late',
};

function fieldEventHeadline(event: FieldEventItem): string {
  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? event.type;
  const reasonLabel = formatFieldEventReason(event.type, event.reason);
  const minutes =
    event.type === InspectorFieldEventType.LATE_NOTICE && event.minutesLate != null
      ? `, ~${event.minutesLate} min`
      : '';
  return `${typeLabel} — ${reasonLabel}${minutes}`;
}

function flagChips(execution: ExecutionSummary): string[] {
  const chips: string[] = [];
  if (execution.outOfRadius) chips.push(`Outside geofence (${execution.geofenceRadiusMeters ?? '?'} m)`);
  if (execution.outOfWindow) chips.push('Outside time window');
  if (execution.finishOutOfRadius) chips.push('Checked out outside geofence');
  if (execution.abandonedAt) chips.push('Abandoned');
  return chips;
}

/**
 * "Field activity" block on the appointment detail: the execution summary
 * (check-in/out times, distances, accuracy, flags) and the field events, with a
 * privacy cut — this component NEVER reads an inspector coordinate field
 * (`startLatitude`, `fieldEvent.latitude`, …). The backend already omits them
 * for CL roles; not reading them at all means the web cannot leak even if one
 * slips through. There is no map link.
 */
export function AppointmentFieldActivitySection({ appointmentId }: AppointmentFieldActivitySectionProps) {
  const { fieldActivity, isLoading, isError, refetch } = useAppointmentFieldActivity(appointmentId);

  if (isLoading) {
    return (
      <FormSection title="Field activity">
        <LoadingState rows={3} variant="card" />
      </FormSection>
    );
  }

  if (isError) {
    return (
      <FormSection title="Field activity">
        <ErrorState message="Couldn't load field activity" onRetry={refetch} />
      </FormSection>
    );
  }

  const execution = fieldActivity?.execution ?? null;
  const events = fieldActivity?.events ?? [];

  if (!execution && events.length === 0) {
    return (
      <FormSection title="Field activity">
        <p className="text-sm text-text-muted">No field activity yet.</p>
      </FormSection>
    );
  }

  const chips = execution ? flagChips(execution) : [];
  const startNote = execution ? deviceTimeNote(execution.startedAt, execution.startClientAt) : null;
  const finishNote =
    execution && execution.finishedAt
      ? deviceTimeNote(execution.finishedAt, execution.finishClientAt)
      : null;

  return (
    <FormSection title="Field activity">
      {execution && (
        <div className="flex flex-col gap-2">
          <DetailRow
            label="Checked in"
            value={
              <span>
                {formatInstantDateTime(execution.startedAt)}
                {startNote && (
                  <span className="ml-2 text-xs text-text-muted">{startNote}</span>
                )}
              </span>
            }
          />
          <DetailRow
            label="Checked out"
            value={
              execution.finishedAt ? (
                <span>
                  {formatInstantDateTime(execution.finishedAt)}
                  {finishNote && (
                    <span className="ml-2 text-xs text-text-muted">{finishNote}</span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          {execution.abandonedAt && (
            <DetailRow label="Check-in abandoned" value={formatInstantDateTime(execution.abandonedAt)} />
          )}
          <p className="text-sm text-text-primary">
            Distance at check-in: {distanceLabel(execution.startDistanceMeters, execution.startAccuracyMeters)}
          </p>
          {execution.finishedAt && (
            <p className="text-sm text-text-primary">
              Distance at check-out: {distanceLabel(execution.finishDistanceMeters, execution.finishAccuracyMeters)}
            </p>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {chips.map((chip) => (
                <Chip key={chip}>{chip}</Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {events.length > 0 && (
        <div className={cn('flex flex-col gap-3', execution && 'mt-4 border-t border-black/10 pt-4')}>
          <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">Field events</p>
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="text-sm text-text-primary">
                <p className="font-medium">{fieldEventHeadline(event)}</p>
                {event.note && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-text-secondary">{event.note}</p>
                )}
                <p className="mt-0.5 text-xs text-text-muted">
                  by {event.inspectorName ?? 'Inspector'} &middot; {formatInstantDateTime(event.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormSection>
  );
}
