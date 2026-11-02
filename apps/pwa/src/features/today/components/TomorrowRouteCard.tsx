import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatInstantTime } from '@properfy/shared';
import type { DayPlanQueryResult } from '@/features/day-plan/hooks/useDayPlan';
import { stopsInOrder } from '@/features/day-plan/lib/day-plan-view';

interface TomorrowRouteCardProps {
  /** Civil date of tomorrow (plan timezone). */
  date: string;
  query: DayPlanQueryResult;
}

/**
 * Tomorrow's route teaser. Fixed "ready at 7:30 pm" copy (agency hour, Q9) only
 * on a `NOT_PUBLISHED` 404 — a published plan returns 200 in any timezone
 * (L-F04-02). Hidden on error/offline so it never competes with today.
 */
export function TomorrowRouteCard({ date, query }: TomorrowRouteCardProps) {
  if (query.state === 'NOT_PUBLISHED') {
    return (
      <section className="rounded-card border border-border bg-card px-4 py-3" data-testid="tomorrow-card">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tomorrow</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tomorrow&apos;s route will be ready at 7:30 pm</p>
      </section>
    );
  }

  if ((query.state === 'OK' || query.state === 'STALE') && query.data) {
    const stops = stopsInOrder(query.data);
    if (stops.length === 0) {
      return (
        <section className="rounded-card border border-border bg-card px-4 py-3" data-testid="tomorrow-card">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tomorrow</h2>
          <p className="mt-1 text-sm text-muted-foreground">No inspections tomorrow</p>
        </section>
      );
    }
    const first = stops[0]!;
    const firstEta = first.eta ? formatInstantTime(first.eta, first.timezone) : '';
    const count = `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`;
    return (
      <Link
        to={`/today/route/${date}`}
        className="flex min-h-touch items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
        data-testid="tomorrow-card"
      >
        <div className="flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tomorrow</h2>
          <p className="mt-1 text-sm font-semibold text-foreground">
            Tomorrow · {count}
            {firstEta ? ` · first at ${firstEta}` : ''}
          </p>
          <span className="text-sm font-semibold text-primary">View route</span>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }

  // ERROR / offline / NOT_FOUND — hide the card.
  return null;
}
