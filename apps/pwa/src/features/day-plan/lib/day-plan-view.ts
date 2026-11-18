import type { DayPlanResponse, DayPlanStop } from '@properfy/shared';

/**
 * Pure selectors over a `DayPlanResponse`. They never mutate the plan and always
 * read stops in `sequence` order, so a payload that arrives out of order renders
 * correctly. The "next" / "coming up" set is derived live from each stop's
 * execution state (DB11) — nothing is persisted client-side.
 */

const COMING_UP_LIMIT = 3;

/** Stops in ascending `sequence` order (copy; never mutates the input). */
export function stopsInOrder(plan: DayPlanResponse): DayPlanStop[] {
  return [...plan.stops].sort((a, b) => a.sequence - b.sequence);
}

/** A stop the inspector still has to act on: in progress, or not yet executed. */
function isActive(stop: DayPlanStop): boolean {
  return stop.executionStatus === 'IN_PROGRESS' || !stop.executed;
}

/** `{ done, total }` — done counts stops already marked `DONE`. */
export function progress(plan: DayPlanResponse): { done: number; total: number } {
  const total = plan.stops.length;
  const done = plan.stops.filter((s) => s.appointmentStatus === 'DONE').length;
  return { done, total };
}

/** The current stop: the first in-progress or not-executed stop, else `null`. */
export function nextStop(plan: DayPlanResponse): DayPlanStop | null {
  return stopsInOrder(plan).find(isActive) ?? null;
}

/**
 * The next stop to drive to after completing `appointmentId`: the first still-active
 * stop ordered after it. The just-completed stop is excluded by position, so a cached
 * plan that has not yet reflected the completion still resolves the right next job.
 * Null when the appointment is not in the plan or no active stop follows it (last job).
 */
export function nextStopAfter(plan: DayPlanResponse, appointmentId: string): DayPlanStop | null {
  const ordered = stopsInOrder(plan);
  const index = ordered.findIndex((s) => s.appointmentId === appointmentId);
  if (index === -1) return null;
  return ordered.slice(index + 1).find(isActive) ?? null;
}

/**
 * True when `appointmentId` was the last active job of the plan's day: it belongs to
 * the plan and no *other* stop is still active. Ignores the just-completed stop itself
 * so an offline finish (cached plan still shows it active) still counts as "all done".
 */
export function isLastActiveStop(plan: DayPlanResponse, appointmentId: string): boolean {
  const inPlan = plan.stops.some((s) => s.appointmentId === appointmentId);
  if (!inPlan) return false;
  return !plan.stops.some((s) => s.appointmentId !== appointmentId && isActive(s));
}

/** Up to three not-executed stops after the current one. */
export function comingUp(plan: DayPlanResponse): DayPlanStop[] {
  const ordered = stopsInOrder(plan);
  const next = nextStop(plan);
  if (!next) return [];
  const startIndex = ordered.findIndex((s) => s.appointmentId === next.appointmentId);
  const upcoming: DayPlanStop[] = [];
  for (let i = startIndex + 1; i < ordered.length && upcoming.length < COMING_UP_LIMIT; i += 1) {
    const stop = ordered[i]!;
    if (!stop.executed) upcoming.push(stop);
  }
  return upcoming;
}

/** True when the plan has stops and none of them is still active. */
export function allDone(plan: DayPlanResponse): boolean {
  return plan.stops.length > 0 && nextStop(plan) === null;
}

/** True when the plan has no stops at all. */
export function isEmpty(plan: DayPlanResponse): boolean {
  return plan.stops.length === 0;
}
