import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useCivilToday } from '@/features/today/hooks/useCivilToday';
import { useDayPlan } from '../hooks/useDayPlan';
import { RouteSummary } from '../components/RouteSummary';
import { RouteStopList } from '../components/RouteStopList';
import { RouteWarnings } from '../components/RouteWarnings';
import { RouteSheetMenu } from '../components/RouteSheetMenu';
import { OriginRow } from '../components/OriginRow';
import { stopsInOrder } from '../lib/day-plan-view';
import { formatCivilDateLong, formatCivilDateShort } from '../lib/format-route';

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCivilDate(value: string): boolean {
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function RoutePage() {
  const { date: dateParam } = useParams();
  const today = useCivilToday();

  // All hooks run unconditionally (rules of hooks); the redirect is decided after.
  const invalidDate = dateParam !== undefined && !isValidCivilDate(dateParam);
  const date = invalidDate ? today : dateParam ?? today;
  const query = useDayPlan(date, { enabled: !invalidDate });
  const isToday = date === today;
  const isPast = date < today;

  // Invalid date in the path → fall back to today's route.
  if (invalidDate) {
    return <Navigate to="/today/route" replace />;
  }

  const title = isToday ? "Today's route" : `Route · ${formatCivilDateShort(date)}`;

  const header = (
    <TopBar title={title} showBack backTo="/today" backHideOnWide />
  );

  if (query.state === 'LOADING' && !query.data) {
    return (
      <div>
        {header}
        <div className="p-4" aria-busy="true">
          <LoadingState rows={5} />
        </div>
      </div>
    );
  }

  if (!query.data) {
    if (query.isOffline) {
      return (
        <div>
          {header}
          <div className="p-4">
            <ErrorState
              message="You're offline. Connect to load this route."
              onRetry={query.refetch}
              retryLabel="Retry"
            />
          </div>
        </div>
      );
    }
    if (query.state === 'NOT_PUBLISHED') {
      return (
        <div>
          {header}
          <div className="p-4">
            <EmptyState title="Your route for this day isn't ready yet. It's published at 7:30 pm the day before." />
          </div>
        </div>
      );
    }
    if (query.state === 'NOT_FOUND') {
      return (
        <div>
          {header}
          <div className="p-4">
            <EmptyState
              title="There is no route for this day."
              action={{ label: 'Back to Today', onClick: () => window.history.back() }}
            />
          </div>
        </div>
      );
    }
    return (
      <div>
        {header}
        <div className="p-4">
          <ErrorState message="Couldn't load this route" onRetry={query.refetch} retryLabel="Retry" />
        </div>
      </div>
    );
  }

  const plan = query.data;
  const stops = stopsInOrder(plan);
  const durations = new Set(stops.map((s) => s.durationMinutes));
  const eachDuration = durations.size === 1 && stops.length > 0 ? [...durations][0] : null;
  const stopCount = `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`;

  return (
    <div>
      {header}
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground" data-testid="route-subheader">
            {`${formatCivilDateLong(plan.date)} · ${stopCount}${
              eachDuration != null ? ` · ${eachDuration} min each` : ''
            }`}
          </p>
          <RouteSheetMenu date={date} />
        </div>

        <RouteSummary plan={plan} />

        <OriginRow plan={plan} readOnly={isPast} />

        {query.isOffline && (
          <p className="text-sm text-muted-foreground">Offline · showing your last saved route</p>
        )}

        {/* OriginRow owns the origin warning on this screen; RouteWarnings covers the rest. */}
        <RouteWarnings originWarning={null} approximate={plan.approximate} stale={query.state === 'STALE'} />

        <RouteStopList plan={plan} />
      </div>
    </div>
  );
}
