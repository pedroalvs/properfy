import type { EtaPlanInput, EtaPlanStop, EtaRealEvents } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '../../../shared/domain/timezone-date';
import type { LiveDayEventRow, LiveDayInspectorRow, LiveDayStopRow } from './live-day.read-repository';
import { toDate, windowStartInstant, windowEndInstant } from './stop-view';

/**
 * Adapters from the single query's flat rows to the shared F06 `projectStopEta`
 * inputs (L-F05-10). F05 builds `EtaPlanInput` directly from raw rows rather than
 * via `etaPlanInputFromDayPlanResponse`, which would need a partial `DayPlanResponse`.
 * The departure rule and the `LATE_NOTICE` floor belong to F06 and are NOT repeated.
 *
 * `planRows` are the T-1-visible rows WITH a `sequence` (in-plan stops); out-of-plan
 * stops never go through the projection (their predicted time is the window start).
 */

function toEtaPlanStop(row: LiveDayStopRow): EtaPlanStop {
  return {
    appointmentId: row.appointmentId,
    sequence: row.sequence as number,
    tenantId: row.tenantId,
    scheduledDate: row.scheduledDate,
    appointmentStatus: row.status,
    travelS: row.travelS ?? 0,
    durationMinutes: row.stopDurationMinutes ?? row.defaultDurationMinutes,
    windowStartAt: windowStartInstant(row),
    windowEndAt: windowEndInstant(row),
    windowTimezone: row.windowTimezone ?? row.tenantTimezone,
    missingCoordinates: row.propertyLat === null || row.propertyLng === null,
    serviceStartAt: toDate(row.serviceStartAt),
    serviceEndAt: toDate(row.serviceEndAt),
    publishedServiceStartAt: toDate(row.publishedServiceStartAt),
  };
}

export function toEtaPlanInput(
  row: LiveDayInspectorRow,
  planRows: LiveDayStopRow[],
  date: string,
): EtaPlanInput {
  return {
    dayPlanId: row.planId as string,
    planVersion: row.planVersion ?? 0,
    planDate: date,
    timezone: row.planTimezone ?? PLATFORM_TIMEZONE,
    hasOrigin: row.originSource !== null && row.originSource !== 'NONE',
    departureAt: toDate(row.departureAt),
    approximate: row.approximate ?? false,
    stops: planRows.map(toEtaPlanStop),
  };
}

export function toEtaRealEvents(
  visibleRows: LiveDayStopRow[],
  events: LiveDayEventRow[],
): EtaRealEvents {
  const executions = new Map<string, { startedAt: Date | null; finishedAt: Date | null }>();
  for (const row of visibleRows) {
    // An abandoned check-in counts as "not started" everywhere (D18), so it must not
    // reach the projection as an execution.
    if (row.abandonedAt !== null) continue;
    if (row.startedAt !== null || row.finishedAt !== null) {
      executions.set(row.appointmentId, {
        startedAt: toDate(row.startedAt),
        finishedAt: toDate(row.finishedAt),
      });
    }
  }

  const lateNotices = new Map<
    string,
    { minutesLate: number; createdAt: Date; clientOccurredAt: Date | null }
  >();
  for (const event of events) {
    if (event.type !== 'LATE_NOTICE' || event.minutes === null) continue;
    const createdAt = new Date(event.createdAt);
    const existing = lateNotices.get(event.appointmentId);
    // Keep the latest-of-day late notice per appointment.
    if (existing && existing.createdAt.getTime() >= createdAt.getTime()) continue;
    lateNotices.set(event.appointmentId, {
      minutesLate: event.minutes,
      createdAt,
      clientOccurredAt: toDate(event.clientOccurredAt),
    });
  }

  return { executions, lateNotices };
}
