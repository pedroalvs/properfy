import { type ReactNode, useId } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MapPin } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { formatWallTimeRange, formatInstantTime, type DayPlanStop } from '@properfy/shared';
import { Badge } from '@/components/ui/Badge';
import { formatDriveDuration, formatDistance } from '../lib/format-route';
import { CallContactLink } from './CallContactLink';
import { NavigateButton } from './NavigateButton';

interface StopCardProps {
  stop: DayPlanStop;
  variant: 'next' | 'row';
  /** Extra actions (e.g. the check-in/out bar) rendered under the `next` card. */
  actions?: ReactNode;
  /** Row variant only: show this position instead of `stop.sequence` (local reorder draft). */
  displayNumber?: number;
  /** Row variant only: replace the ETA/status text (e.g. a local "~9:12 am" during reorder). */
  etaOverride?: string;
}

function statusText(stop: DayPlanStop): string {
  if (stop.appointmentStatus === 'DONE') return 'Done';
  if (stop.executionStatus === 'IN_PROGRESS') return 'In progress';
  return stop.eta ? `ETA ${formatInstantTime(stop.eta, stop.timezone)}` : '';
}

function borderTone(stop: DayPlanStop): string {
  if (stop.executionStatus === 'IN_PROGRESS') return 'border-l-4 border-l-primary';
  if (stop.lateS > 0) return 'border-l-4 border-l-warning';
  return '';
}

function metaLine(stop: DayPlanStop): string {
  const parts = [`Window ${formatWallTimeRange(stop.windowStart, stop.windowEnd)}`];
  if (stop.travelS > 0) {
    const drive = formatDriveDuration(stop.travelS);
    if (drive) parts.push(drive);
  }
  const distance = formatDistance(stop.distanceM);
  if (distance) parts.push(distance);
  return parts.join(' · ');
}

function Chips({ stop }: { stop: DayPlanStop }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {stop.keyRequired && (
        <Badge tone="gray">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          Key required
        </Badge>
      )}
      {stop.meetingLocation && <Badge tone="gray">{`Meet at: ${stop.meetingLocation}`}</Badge>}
      {stop.waitS > 0 && <Badge tone="blue">{`Wait ${Math.round(stop.waitS / 60)} min for window`}</Badge>}
      {stop.lateS > 0 && <Badge tone="amber">Arrives after window</Badge>}
      {stop.missingCoordinates && <Badge tone="gray">Location not found for this address</Badge>}
    </div>
  );
}

/**
 * One stop, in two shapes: `next` (the Today screen's hero card, with contact,
 * Navigate and the action bar passed as `actions`) and `row` (a compact line for
 * Coming up and the Route list). The tappable body is a `<Link>` to the existing
 * service detail; contact/navigate/actions are siblings, so no button or anchor
 * is ever nested inside another.
 */
export function StopCard({ stop, variant, actions, displayNumber, etaOverride }: StopCardProps) {
  const labelId = useId();
  const detailHref = `/schedule/${stop.appointmentId}`;
  const status = etaOverride ?? statusText(stop);
  const executed = stop.executed || stop.appointmentStatus === 'DONE';

  if (variant === 'row') {
    const number = displayNumber ?? stop.sequence;
    const name = `Stop ${number}, ${stop.propertyAddress}${status ? `, ${status}` : ''}`;
    return (
      <article
        aria-label={name}
        className={cn(
          'overflow-hidden rounded-card border border-border bg-card',
          borderTone(stop),
          executed && 'opacity-60',
        )}
      >
        <Link to={detailHref} className="flex items-start gap-3 p-3">
          <span
            aria-hidden="true"
            className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-bold text-primary"
          >
            {number}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{stop.propertyAddress}</p>
            <p className="truncate text-xs text-muted-foreground">
              {stop.suburb} · {formatWallTimeRange(stop.windowStart, stop.windowEnd)}
            </p>
            {stop.missingCoordinates && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                Location not found for this address
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{status}</span>
        </Link>
      </article>
    );
  }

  // variant === 'next'
  const label = stop.executionStatus === 'IN_PROGRESS' ? 'IN PROGRESS' : 'NEXT INSPECTION';
  return (
    <article
      aria-labelledby={labelId}
      className={cn(
        'overflow-hidden rounded-card border border-border bg-card shadow-sm',
        borderTone(stop),
        executed && 'opacity-60',
      )}
    >
      <Link to={detailHref} className="block p-4 text-left">
        <div className="flex items-center justify-between gap-2">
          <span id={labelId} className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {status && <span className="shrink-0 text-sm font-semibold text-foreground">{status}</span>}
        </div>
        <p className="mt-1 text-base font-bold leading-5 text-foreground">{stop.propertyAddress}</p>
        {stop.suburb && <p className="text-sm text-muted-foreground">{stop.suburb}</p>}
        <p className="mt-1 text-sm text-muted-foreground">{metaLine(stop)}</p>
        <Chips stop={stop} />
      </Link>

      {stop.primaryContact?.phone && (
        <div className="px-4 pb-2">
          <CallContactLink contact={stop.primaryContact} />
        </div>
      )}

      <div className="flex items-stretch gap-2 px-4 pb-3">
        <NavigateButton
          target={{ lat: stop.lat, lng: stop.lng, address: stop.propertyAddress }}
          className="flex-1"
        />
      </div>

      {actions}
    </article>
  );
}
