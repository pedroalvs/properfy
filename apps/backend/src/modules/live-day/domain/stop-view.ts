import { zonedWallTimeToUtc } from '@properfy/shared';
import { classifyStops, type ClassifiableStop } from '../../day-plan/domain/classify-stops';
import type { LiveDayStopRow } from './live-day.read-repository';

/**
 * Shared, Prisma-free view helpers over the flat stop rows. The execution class
 * reuses F04 `classifyStops` for the D18 "executed" boundary (L-F04-16) so F05
 * never re-implements what counts as started/executed; it only adds the
 * FINISHED vs IN_PROGRESS split within the executed set.
 */

export type ExecClass = 'FINISHED' | 'IN_PROGRESS' | 'NOT_STARTED';

export function toDate(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso);
}

/** Effective window-start instant: the plan window when present, else the booked slot in the agency tz. */
export function windowStartInstant(row: LiveDayStopRow): Date {
  if (row.windowStartAt) return new Date(row.windowStartAt);
  return zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.tenantTimezone);
}

/** Effective window-end instant (used for past-day NOT_STARTED, L-F05-02). */
export function windowEndInstant(row: LiveDayStopRow): Date {
  if (row.windowEndAt) return new Date(row.windowEndAt);
  return zonedWallTimeToUtc(row.scheduledDate, row.timeSlotEnd, row.tenantTimezone);
}

/**
 * Baseline for the not-started alert and the accumulated / per-stop delay (D-12).
 *
 * It prefers the plan's routed per-stop ETA (`service_start_at`) — but **only while
 * that ETA still falls inside the stop's CURRENT booking window** (`scheduled_date`
 * + `time_slot_start`/`time_slot_end` in the agency timezone, read from the LIVE
 * appointment columns). Otherwise it falls back to the current window start.
 *
 * Why the guard: a reschedule moves the live window but does NOT rewrite the frozen
 * stop columns (`service_start_at`, `published_service_start_at`, the stored
 * `day_plan_stops.window_start_at`) — marking the plan STALE only bumps its status.
 * So after a reschedule the frozen ETA lands outside the new window and the guard
 * rejects it, keeping the reschedule-safe behaviour (#1385). For a window WIDER than
 * the service with no reschedule, the ETA is still inside the window and is used, so
 * a cohort of stops sharing one wide window is each measured from its own routed
 * arrival instead of all from the window start.
 *
 * It deliberately never returns `published_service_start_at`: that frozen value stays
 * the private source of the Route ETA-accuracy metric (`get-route-eta-accuracy.use-case.ts`,
 * L-F04-15), which lives in the day-plan module and never reads this function.
 *
 * The window bounds are built from the live appointment columns via `zonedWallTimeToUtc`,
 * NOT from `windowStartInstant`/`windowEndInstant`: those helpers prefer the frozen
 * stored `day_plan_stops.window_*` columns, which a reschedule does not rewrite, and
 * would reintroduce the staleness this guard is meant to avoid.
 */
export function baselineInstant(row: LiveDayStopRow): Date {
  const winStart = zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.tenantTimezone);
  if (row.serviceStartAt) {
    const svc = new Date(row.serviceStartAt);
    const winEnd = zonedWallTimeToUtc(row.scheduledDate, row.timeSlotEnd, row.tenantTimezone);
    if (svc.getTime() >= winStart.getTime() && svc.getTime() <= winEnd.getTime()) return svc;
  }
  return winStart;
}

function toClassifiable(row: LiveDayStopRow): ClassifiableStop {
  return {
    appointmentId: row.appointmentId,
    appointmentStatus: row.status,
    startedAt: toDate(row.startedAt),
    finishedAt: toDate(row.finishedAt),
    abandonedAt: toDate(row.abandonedAt),
    windowStartAt: windowStartInstant(row),
  };
}

/** Per-appointment execution class, with the executed set drawn from F04 `classifyStops`. */
export function execClassOf(rows: LiveDayStopRow[]): Map<string, ExecClass> {
  const { executed } = classifyStops(rows.map(toClassifiable));
  const executedIds = new Set(executed.map((s) => s.appointmentId));
  const result = new Map<string, ExecClass>();
  for (const row of rows) {
    if (!executedIds.has(row.appointmentId)) {
      result.set(row.appointmentId, 'NOT_STARTED');
      continue;
    }
    const finished =
      row.status === 'DONE' || (row.finishedAt !== null && row.abandonedAt === null);
    result.set(row.appointmentId, finished ? 'FINISHED' : 'IN_PROGRESS');
  }
  return result;
}

/** Display order: plan stops by sequence, then out-of-plan stops by window start (§3). */
export function orderStops(rows: LiveDayStopRow[]): LiveDayStopRow[] {
  const inPlan = rows
    .filter((r) => r.sequence !== null)
    .sort((a, b) => (a.sequence as number) - (b.sequence as number));
  const outOfPlan = rows
    .filter((r) => r.sequence === null)
    .sort((a, b) => windowStartInstant(a).getTime() - windowStartInstant(b).getTime());
  return [...inPlan, ...outOfPlan];
}
