/**
 * "Running late" domain helpers (F03, L-F03-04 / D23).
 *
 * The estimated arrival is derived, never stored. Both the use case (for the
 * response) and any later consumer that reads the raw event recompute it from the
 * same inputs via `computeEstimatedArrivalAt`, so the rule lives in exactly one
 * place.
 */

/**
 * `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate`.
 *
 * `reference` is the published-plan stop start when the inspector has a published
 * day plan, otherwise the booked window start; `effectiveNoticeAt` is when the
 * inspector actually sent the notice (client time when plausible, else server
 * now). Taking the later of the two means a notice sent after the reference has
 * already passed is measured from "now", not from a reference in the past.
 */
export function computeEstimatedArrivalAt(
  reference: Date,
  effectiveNoticeAt: Date,
  minutesLate: number,
): Date {
  const base = Math.max(reference.getTime(), effectiveNoticeAt.getTime());
  return new Date(base + minutesLate * 60_000);
}

/**
 * Port that resolves the published-plan start of a stop for a running-late
 * estimate. F03 registers a null implementation (no published plans exist yet);
 * TASK-F04-2 wires the real adapter reading `DayPlanStop.published_service_start_at`.
 */
export interface IPublishedStopStartReader {
  /**
   * The published service start for this appointment's stop on `scheduledDate`
   * (agency civil date), or `null` when the inspector has no published plan for
   * it — in which case the caller falls back to the booked window start.
   */
  find(appointmentId: string, inspectorId: string, scheduledDate: string): Promise<Date | null>;
}

/** F03-phase reader: no published plans yet, so the window start always applies. */
export class NullPublishedStopStartReader implements IPublishedStopStartReader {
  async find(): Promise<Date | null> {
    return null;
  }
}
