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
 * It is the stop's CURRENT booking window start — `scheduled_date` + `time_slot_start`
 * in the agency timezone, read from the live appointment columns — so a reschedule
 * moves it. It deliberately ignores `published_service_start_at`, `service_start_at`
 * and the stored `day_plan_stops.window_start_at`: all three freeze at plan compute
 * time and are NOT rewritten on reschedule (marking the plan STALE only bumps the
 * plan status), so a stop rescheduled from 17:00 to 13:00 would otherwise keep
 * alerting/measuring against the frozen 17:00.
 *
 * The frozen `published_service_start_at` stays the source of the Route ETA-accuracy
 * metric (`get-route-eta-accuracy.use-case.ts`, L-F04-15); that metric lives in the
 * day-plan module and never reads this function.
 */
export function baselineInstant(row: LiveDayStopRow): Date {
  return zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.tenantTimezone);
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
