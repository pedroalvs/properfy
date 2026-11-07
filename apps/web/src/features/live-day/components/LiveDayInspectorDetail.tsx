import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import {
  type LiveDayInspector,
  type LiveDayStop,
  formatInstantTime,
  inspectorRouteColor,
} from '@properfy/shared';
import { LiveDayStateBadge } from './LiveDayStateBadge';
import { LiveDayAlertList } from './LiveDayAlertList';
import { LiveDayStopList } from './LiveDayStopList';
import { formatDelay } from '../lib/liveDayView';

interface LiveDayInspectorDetailProps {
  inspector: LiveDayInspector;
  /** Actor timezone — the fallback for alert/last-known times not tied to a stop. */
  timezone: string;
  isPastDay: boolean;
  /** True while the selected inspector's route geometry has been requested but not yet returned. */
  routeLoading?: boolean;
  onBack: () => void;
}

/** "Last known location: …" copy (D1). Check-in/out times format in the stop's tz. */
function lastKnownLabel(inspector: LiveDayInspector, stops: LiveDayStop[], fallbackTz: string): string {
  const { source, at, appointmentId, label } = inspector.lastKnown;
  if (source === 'NONE') return 'Location unknown';
  if (source === 'BASE') {
    return label === 'Start of day' ? "today's start address (no check-in yet)" : 'base (no check-in yet)';
  }
  const verb = source === 'CHECK_OUT' ? 'check-out' : 'check-in';
  const stop = stops.find((s) => s.appointmentId === appointmentId);
  const tz = stop?.timezone ?? fallbackTz;
  const time = at ? formatInstantTime(at, tz) : '';
  const address = stop ? ` · ${stop.propertyAddress}, ${stop.suburb}` : '';
  return `${verb} at ${time}${address}`;
}

/**
 * The selected inspector's view: a focusable heading (name/state/last-known/
 * progress/delay), the alert list and the ordered stop list. The map draws the
 * route separately; this panel is the accessible alternative to the drawn line
 * (WCAG 1.1.1).
 */
export const LiveDayInspectorDetail = forwardRef<HTMLHeadingElement, LiveDayInspectorDetailProps>(
  function LiveDayInspectorDetail({ inspector, timezone, isPastDay, routeLoading = false, onBack }, headingRef) {
    const color = inspectorRouteColor(inspector.inspectorId).hex;
    const { done, total } = inspector.progress;

    return (
      <div className="flex flex-col gap-3 p-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
        >
          <i className="mdi mdi-arrow-left text-base leading-none" aria-hidden="true" />
          Back to all inspectors
        </button>

        <h2 ref={headingRef} tabIndex={-1} className="flex flex-col gap-1 outline-none">
          <span className="flex items-center gap-2">
            <span className="text-lg font-bold text-secondary">{inspector.inspectorName}</span>
            <LiveDayStateBadge state={inspector.state} />
          </span>
          <span className="text-sm text-text-secondary">
            Last known location: {lastKnownLabel(inspector, inspector.stops, timezone)}
          </span>
          <span className="text-sm text-text-secondary">
            {done} of {total} done · {formatDelay(inspector.delayMinutes)}
          </span>
        </h2>

        {/* Path to the per-inspector alert-limit override (L-F05-14). Same tab, so the
            browser Back button returns here with the ?date/?inspector selection intact. */}
        <div className="flex flex-col gap-0.5">
          <Link
            to={`/inspectors?open=${inspector.inspectorId}`}
            className="inline-flex items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
          >
            <i className="mdi mdi-account-arrow-right-outline text-base leading-none" aria-hidden="true" />
            Open inspector
          </Link>
          <span className="text-xs text-text-muted">Alert limits for this inspector are set in their profile</span>
        </div>

        {routeLoading && (
          <p className="flex items-center gap-1 text-xs text-text-muted" role="status">
            <i className="mdi mdi-loading mdi-spin text-sm leading-none" aria-hidden="true" />
            Loading route…
          </p>
        )}

        {inspector.alerts.length > 0 && (
          <LiveDayAlertList
            alerts={inspector.alerts}
            stops={inspector.stops}
            fallbackTimezone={timezone}
            isPastDay={isPastDay}
          />
        )}

        <LiveDayStopList stops={inspector.stops} color={color} isPastDay={isPastDay} />
      </div>
    );
  },
);
