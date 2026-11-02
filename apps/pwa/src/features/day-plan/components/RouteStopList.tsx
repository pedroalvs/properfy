import { Fragment } from 'react';
import { formatWallTimeRange, type DayPlanResponse } from '@properfy/shared';
import { stopsInOrder } from '../lib/day-plan-view';
import { StopCard } from './StopCard';
import { RouteLegRow } from './RouteLegRow';

interface RouteStopListProps {
  plan: DayPlanResponse;
}

/**
 * Ordered list of stops with the travel leg before each one (the leg arriving at
 * that stop; the first is labelled "From start" when the plan has an origin). A
 * window violation adds an "Arrives after its window (…)" note under the stop.
 */
export function RouteStopList({ plan }: RouteStopListProps) {
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
              <RouteLegRow
                travelS={stop.travelS}
                distanceM={stop.distanceM}
                waitS={stop.waitS}
                fromStart={index === 0}
              />
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
