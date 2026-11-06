import type { LiveDayStopProgress } from '@properfy/shared';
import type { LiveDayStopRow } from './live-day.read-repository';
import { execClassOf, orderStops } from './stop-view';

/**
 * Per-stop progress (§3), keyed by appointmentId:
 *  - FINISHED            -> DONE
 *  - IN_PROGRESS         -> the one with the greatest startedAt is CURRENT, the rest OPEN
 *  - NOT_STARTED         -> if no CURRENT exists yet, the FIRST not-started in order is CURRENT;
 *                           the rest are REMAINING
 * There is at most one CURRENT.
 */
export function deriveStopProgress(rows: LiveDayStopRow[]): Map<string, LiveDayStopProgress> {
  const classes = execClassOf(rows);
  const ordered = orderStops(rows);
  const result = new Map<string, LiveDayStopProgress>();

  const inProgress = ordered.filter((r) => classes.get(r.appointmentId) === 'IN_PROGRESS');
  let currentAssigned = false;
  if (inProgress.length > 0) {
    const current = inProgress.reduce((a, b) =>
      new Date(a.startedAt as string).getTime() >= new Date(b.startedAt as string).getTime() ? a : b,
    );
    for (const r of inProgress) {
      result.set(r.appointmentId, r.appointmentId === current.appointmentId ? 'CURRENT' : 'OPEN');
    }
    currentAssigned = true;
  }

  for (const r of ordered) {
    const cls = classes.get(r.appointmentId);
    if (cls === 'FINISHED') {
      result.set(r.appointmentId, 'DONE');
    } else if (cls === 'NOT_STARTED') {
      if (!currentAssigned) {
        result.set(r.appointmentId, 'CURRENT');
        currentAssigned = true;
      } else {
        result.set(r.appointmentId, 'REMAINING');
      }
    }
    // IN_PROGRESS stops were assigned above.
  }

  return result;
}
