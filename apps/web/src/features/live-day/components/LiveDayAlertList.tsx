import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type LiveDayAlert, type LiveDayStop, formatInstantTime } from '@properfy/shared';

interface LiveDayAlertListProps {
  alerts: LiveDayAlert[];
  /** The inspector's stops — used to resolve each alert's agency timezone by appointmentId. */
  stops: LiveDayStop[];
  /** Actor timezone, used when an alert's appointment is not a current stop (e.g. CANT_DO). */
  fallbackTimezone: string;
  /** Past day → no "N min ago" relative phrasing (L-F05-02). */
  isPastDay: boolean;
}

/** The appointment code as a same-tab link (every alert code links, incl. CANT_DO, L-F05-14). */
function CodeLink({ alert }: { alert: LiveDayAlert }) {
  if (!alert.appointmentId || !alert.appointmentCode) return <>{alert.appointmentCode ?? ''}</>;
  return (
    <Link to={`/appointments/${alert.appointmentId}`} className="font-semibold text-primary hover:underline">
      {alert.appointmentCode}
    </Link>
  );
}

function minusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();
}

/** The body of one alert, with the appointment code embedded as a link where it belongs. */
function alertBody(alert: LiveDayAlert, tz: string, isPastDay: boolean): ReactNode {
  const code = <CodeLink alert={alert} />;
  switch (alert.type) {
    case 'DELAY': {
      const custom = alert.thresholdSource === 'INSPECTOR' ? ', custom' : '';
      return `Running ${alert.minutes ?? 0} min late (limit ${alert.thresholdMinutes ?? 0} min${custom})`;
    }
    case 'NOT_STARTED': {
      const dueAt =
        alert.thresholdMinutes != null ? minusMinutes(alert.occurredAt, alert.thresholdMinutes) : alert.occurredAt;
      const due = formatInstantTime(dueAt, tz);
      return isPastDay ? (
        <>{code} not started that day (due at {due})</>
      ) : (
        <>
          {code} not started — due at {due} ({alert.minutes ?? 0} min ago)
        </>
      );
    }
    case 'OUT_OF_WINDOW': {
      const tolerance = alert.thresholdMinutes != null ? `, tolerance ${alert.thresholdMinutes} min` : '';
      return (
        <>
          Checked in outside the window for {code} ({alert.minutes ?? 0} min off{tolerance})
        </>
      );
    }
    case 'LATE_NOTICE': {
      const eta = alert.estimatedArrivalAt ? formatInstantTime(alert.estimatedArrivalAt, tz) : '—';
      const reason = alert.reasonLabel ?? alert.reason ?? '';
      return (
        <>
          Said they&apos;d arrive around {eta} ({alert.minutes ?? 0} min late): {reason} · {code}
        </>
      );
    }
    case 'CANT_DO': {
      const reason = alert.reasonLabel ?? alert.reason ?? '';
      return (
        <>
          Couldn&apos;t do {code}: {reason}
          {alert.note ? <span className="mt-0.5 block italic text-text-secondary">{alert.note}</span> : null}
        </>
      );
    }
    case 'GEOFENCE': {
      const verb = alert.phase === 'FINISH' ? 'Checked out' : 'Checked in';
      const limit = alert.radiusMeters != null ? ` (limit ${alert.radiusMeters} m)` : '';
      return (
        <>
          {verb} {alert.distanceMeters ?? 0} m from the property{limit} · {code}
        </>
      );
    }
    case 'COMPLETION_REMINDER': {
      const at = formatInstantTime(alert.occurredAt, tz);
      return <>Completion reminder sent for {code} at {at}</>;
    }
    default:
      return null;
  }
}

/**
 * The alert list for one inspector (01.A5 display). Read-only — there is no
 * acknowledge/dismiss, even per session (FR-018); alerts leave only by the
 * server's exit rules. Each code is a same-tab link to its appointment.
 */
export function LiveDayAlertList({ alerts, stops, fallbackTimezone, isPastDay }: LiveDayAlertListProps) {
  if (alerts.length === 0) return null;
  const tzOf = (alert: LiveDayAlert) =>
    stops.find((s) => s.appointmentId === alert.appointmentId)?.timezone ?? fallbackTimezone;

  return (
    <ul aria-label="Alerts" className="flex flex-col gap-1.5">
      {alerts.map((alert, index) => (
        <li
          key={`${alert.type}-${alert.appointmentId ?? 'none'}-${index}`}
          className="flex items-start gap-2 rounded border border-border-subtle bg-app-bg px-2 py-1.5 text-sm text-text-primary"
        >
          <i className="mdi mdi-alert-circle-outline mt-0.5 text-base leading-none text-warning" aria-hidden="true" />
          <span>{alertBody(alert, tzOf(alert), isPastDay)}</span>
        </li>
      ))}
    </ul>
  );
}
