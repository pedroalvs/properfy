import type { LiveDayInspectorState } from '@properfy/shared';
import type { LiveDayStopRow } from './live-day.read-repository';
import { execClassOf } from './stop-view';

export interface InspectorStateResult {
  state: LiveDayInspectorState;
  progress: { done: number; inProgress: number; remaining: number; total: number };
}

/**
 * Derived inspector state (D2, §2). With I in-progress, F finished and N
 * not-started stops, the first true rule wins:
 *   1. I >= 1            -> AT_PROPERTY
 *   2. N === 0           -> DONE_FOR_DAY   (includes T === 0, reached only via a CANT_DO roster entry)
 *   3. F === 0           -> NOT_STARTED
 *   4. otherwise         -> IN_TRANSIT
 */
export function deriveInspectorState(rows: LiveDayStopRow[]): InspectorStateResult {
  const classes = execClassOf(rows);
  let finished = 0;
  let inProgress = 0;
  let notStarted = 0;
  for (const cls of classes.values()) {
    if (cls === 'FINISHED') finished++;
    else if (cls === 'IN_PROGRESS') inProgress++;
    else notStarted++;
  }

  let state: LiveDayInspectorState;
  if (inProgress >= 1) state = 'AT_PROPERTY';
  else if (notStarted === 0) state = 'DONE_FOR_DAY';
  else if (finished === 0) state = 'NOT_STARTED';
  else state = 'IN_TRANSIT';

  return {
    state,
    progress: { done: finished, inProgress, remaining: notStarted, total: finished + inProgress + notStarted },
  };
}
