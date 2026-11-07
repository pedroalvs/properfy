import { Link } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import { type LiveDayStop, formatWallTimeRange } from '@properfy/shared';
import { stopTimeLabel } from '../lib/liveDayView';

interface LiveDayStopListProps {
  stops: LiveDayStop[];
  /** Inspector colour (hex) for the stop markers. */
  color: string;
  isPastDay: boolean;
}

function StopMarker({ stop, color }: { stop: LiveDayStop; color: string }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold';
  if (stop.progress === 'DONE') {
    return (
      <span className={cn(base, 'text-white')} style={{ backgroundColor: color }} aria-hidden="true">
        <i className="mdi mdi-check-bold text-sm leading-none" />
      </span>
    );
  }
  if (!stop.inPlan) {
    return (
      <span
        className={cn(base, 'border border-dashed bg-white')}
        style={{ borderColor: color, color }}
        aria-hidden="true"
      >
        •
      </span>
    );
  }
  const filled = stop.progress === 'CURRENT' || stop.progress === 'OPEN';
  return (
    <span
      className={cn(base, filled ? 'text-white' : 'border bg-white')}
      style={filled ? { backgroundColor: color } : { borderColor: color, color }}
      aria-hidden="true"
    >
      {stop.sequence ?? '•'}
    </span>
  );
}

/**
 * The ordered stops for one inspector (D7). Done stops show a check + real times,
 * the current stop is highlighted (`aria-current="step"`), and remaining stops
 * show their projected ETA (or "Planned" on a past day). Each code links to its
 * appointment in the same tab.
 */
export function LiveDayStopList({ stops, color, isPastDay }: LiveDayStopListProps) {
  return (
    <ol aria-label="Stops" className="flex flex-col gap-1.5">
      {stops.map((stop) => {
        const isCurrent = stop.progress === 'CURRENT';
        return (
          <li
            key={stop.appointmentId}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex items-start gap-2 rounded px-2 py-1.5 text-sm',
              isCurrent ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-card-bg',
            )}
          >
            <StopMarker stop={stop} color={color} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <Link
                  to={`/appointments/${stop.appointmentId}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {stop.appointmentCode}
                </Link>
                <span className="text-text-secondary">{stop.agencyName}</span>
                {!stop.inPlan && (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning">
                    Not in route yet
                  </span>
                )}
              </div>
              <div className="text-text-secondary">{stop.propertyAddress}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                <span>{formatWallTimeRange(stop.windowStart, stop.windowEnd)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-text-secondary">{stopTimeLabel(stop, { isPastDay })}</span>
              </div>
              {stop.missingCoordinates && (
                <div className="text-xs italic text-text-muted">Location not found for this address</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
