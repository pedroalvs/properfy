import { lazy, Suspense, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { DayPlanResponse } from '@properfy/shared';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useCivilToday } from '@/features/today/hooks/useCivilToday';
import { useDayPlan } from '../hooks/useDayPlan';
import { useReorderDraft } from '../hooks/useReorderDraft';
import { useReorderPreview } from '../hooks/useReorderPreview';
import { useResetDayPlanOrder } from '../hooks/useResetDayPlanOrder';
import { RouteSummary } from '../components/RouteSummary';
import { RouteStopList } from '../components/RouteStopList';
import { RouteWarnings } from '../components/RouteWarnings';
import { RouteSheetMenu } from '../components/RouteSheetMenu';
import { ReorderSaveBar } from '../components/ReorderSaveBar';
import { OriginRow } from '../components/OriginRow';
import { stopsInOrder } from '../lib/day-plan-view';
import { formatCivilDateLong, formatCivilDateShort } from '../lib/format-route';

const RouteMapView = lazy(() => import('../components/RouteMapView'));

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCivilDate(value: string): boolean {
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

interface RouteContentProps {
  plan: DayPlanResponse;
  date: string;
  isPast: boolean;
  isOffline: boolean;
  stale: boolean;
}

/**
 * The route body once a plan is loaded: the List/Map tabs, the reorder draft
 * (shared across both tabs), and the Save bar. Split from `RoutePage` so the
 * draft hook can run unconditionally after the loading/empty/error guards.
 */
function RouteContent({ plan, date, isPast, isOffline, stale }: RouteContentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'map' ? 'map' : 'list';
  const setView = (next: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'map') params.set('view', 'map');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const online = useIsOnline();
  const draft = useReorderDraft(plan, stale);
  const reset = useResetDayPlanOrder(date);
  const [confirmReset, setConfirmReset] = useState(false);
  const reorderEnabled = !isPast && draft.canReorder;
  const preview = useReorderPreview(date, plan, draft, { online, reorderEnabled });

  const stops = stopsInOrder(plan);
  const durations = new Set(stops.map((s) => s.durationMinutes));
  const eachDuration = durations.size === 1 && stops.length > 0 ? [...durations][0] : null;
  const stopCount = `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`;

  const onReset = reorderEnabled
    ? () => {
        if (draft.isDirty) draft.resetToSuggested();
        else setConfirmReset(true);
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground" data-testid="route-subheader">
          {`${formatCivilDateLong(plan.date)} · ${stopCount}${eachDuration != null ? ` · ${eachDuration} min each` : ''}`}
        </p>
        <RouteSheetMenu date={date} />
      </div>

      <RouteSummary plan={plan} draft={draft} preview={preview} onReset={onReset} />

      <OriginRow plan={plan} readOnly={isPast} />

      {isOffline && <p className="text-sm text-muted-foreground">Offline · showing your last saved route</p>}

      <RouteWarnings originWarning={null} approximate={plan.approximate} stale={stale} />

      <Segmented
        aria-label="Route view"
        value={view}
        onChange={setView}
        options={[
          { id: 'list', label: 'List' },
          { id: 'map', label: 'Map' },
        ]}
      />

      {view === 'map' ? (
        <Suspense fallback={<LoadingState rows={4} />}>
          <RouteMapView plan={plan} displayOrder={draft.displayOrder} isDirty={draft.isDirty} />
        </Suspense>
      ) : (
        <RouteStopList plan={plan} draft={draft} preview={preview} reorderEnabled={reorderEnabled} />
      )}

      <ReorderSaveBar draft={draft} preview={preview} date={date} />

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to the suggested order?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Your saved order will be replaced.</p>
          <DialogFooter>
            <Button variant="outlined" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              loading={reset.isPending}
              onClick={async () => {
                await reset.reset();
                setConfirmReset(false);
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RoutePage() {
  const { date: dateParam } = useParams();
  const today = useCivilToday();

  const invalidDate = dateParam !== undefined && !isValidCivilDate(dateParam);
  const date = invalidDate ? today : dateParam ?? today;
  const query = useDayPlan(date, { enabled: !invalidDate });
  const isToday = date === today;
  const isPast = date < today;

  if (invalidDate) {
    return <Navigate to="/today/route" replace />;
  }

  const title = isToday ? "Today's route" : `Route · ${formatCivilDateShort(date)}`;
  const header = <TopBar title={title} showBack backTo="/today" backHideOnWide />;

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
            <ErrorState message="You're offline. Connect to load this route." onRetry={query.refetch} retryLabel="Retry" />
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

  return (
    <div>
      {header}
      <RouteContent
        plan={query.data}
        date={date}
        isPast={isPast}
        isOffline={query.isOffline}
        stale={query.state === 'STALE'}
      />
    </div>
  );
}
