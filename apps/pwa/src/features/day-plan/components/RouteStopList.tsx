import { Fragment } from 'react';
import { formatWallTimeRange, type DayPlanResponse } from '@properfy/shared';
import { stopsInOrder } from '../lib/day-plan-view';
import { StopCard } from './StopCard';
import { RouteLegRow } from './RouteLegRow';
import { ReorderableStopList } from './ReorderableStopList';
import type { ReorderDraft } from '../hooks/useReorderDraft';
import type { ReorderPreviewView } from '../lib/reorder-preview';

interface RouteStopListProps {
  plan: DayPlanResponse;
  /** When reorder is enabled, the draft that drives the reorderable list. */
  draft?: ReorderDraft;
  /** Server-computed evaluation of the draft order (F04 Plan B). */
  preview?: ReorderPreviewView;
  /** Reorder is offered only when the plan can be reordered and the date is ≥ today. */
  reorderEnabled?: boolean;
}

/**
 * The read-only, ordered stop list with travel legs and window-violation notes
 * (the F04-3 view). Used as the static branch when reorder is not available.
 */
function StaticStopList({ plan }: { plan: DayPlanResponse }) {
  const stops = stopsInOrder(plan);
  const hasOrigin = plan.origin.source !== 'NONE';
  const violated = new Set(plan.violations.map((v) => v.appointmentId));

  return (
    <div role="list" className="flex flex-col">
      {stops.map((stop, index) => {
        const showLeg = index > 0 || hasOrigin;
        return (
          <Fragment key={stop.appointmentId}>
            {showLeg && (
              <RouteLegRow travelS={stop.travelS} distanceM={stop.distanceM} waitS={stop.waitS} fromStart={index === 0} />
            )}
            <div role="listitem">
              <StopCard variant="row" stop={stop} />
              {violated.has(stop.appointmentId) && (
                <p className="mt-1 pl-10 text-xs font-medium text-warning" role="note">
                  Arrives after its window ({formatWallTimeRange(stop.windowStart, stop.windowEnd)})
                </p>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Chooses the reorderable list (drag + arrows, local recompute) when reorder is
 * available, otherwise the static F04-3 list. The reorder draft and its Save bar
 * are owned by the Route page so they persist across the List/Map tabs.
 */
export function RouteStopList({ plan, draft, preview, reorderEnabled }: RouteStopListProps) {
  if (reorderEnabled && draft && preview) {
    return <ReorderableStopList plan={plan} draft={draft} preview={preview} />;
  }
  return <StaticStopList plan={plan} />;
}
