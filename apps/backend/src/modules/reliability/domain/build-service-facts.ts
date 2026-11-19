import { PLATFORM_TIMEZONE, civilDateInTz, zonedWallTimeToUtc } from '@properfy/shared';
import { resolveEffectiveEventTime } from '../../inspector-execution/domain/client-occurred-at';
import type {
  ReliabilityFactsRaw,
  ReliabilityLateNoticeRow,
  ReliabilityPlanStopRow,
} from './reliability-facts.reader';
import type { LateNoticeEvent, ServiceFact } from './service-fact';

const keyOf = (appointmentId: string, inspectorId: string) => `${appointmentId}|${inspectorId}`;

interface StopWeight {
  durationMinutes: number;
  plannedTravelMinutes: number;
  publishedEta: Date | null;
  publishedServiceStartAt: Date | null;
}

function stopToWeight(stop: ReliabilityPlanStopRow | undefined, fallbackDurationMinutes: number): StopWeight {
  if (!stop) {
    return {
      durationMinutes: fallbackDurationMinutes,
      plannedTravelMinutes: 0,
      publishedEta: null,
      publishedServiceStartAt: null,
    };
  }
  return {
    durationMinutes: stop.durationMinutes,
    plannedTravelMinutes: (stop.travelSeconds ?? 0) / 60,
    publishedEta: stop.publishedEta,
    publishedServiceStartAt: stop.publishedServiceStartAt,
  };
}

/**
 * Deduplicate and annotate the reader's raw rows into `ServiceFact`s (F07-1, P1).
 *
 * - Windows are built from the agency wall-clock slot (`zonedWallTimeToUtc`).
 * - Weight/published times come from the same inspector's plan stop on the
 *   scheduled date (CANT_ATTEND uses the inspector's most recent stop for the
 *   appointment); without a stop, the service type's duration and no plan times.
 * - A later-rejected DONE (origin `REJECTED_DONE`) is a late rejection when its
 *   service date falls outside `[from, to]` (L-F07-07): it then takes the
 *   rejection date as its service date and only counts in metric 8.
 * - A CANT_ATTEND is dropped when the same inspector has any DONE occurrence or a
 *   NO_SHOW_REJECTED on the same appointment.
 */
export function buildServiceFacts(
  raw: ReliabilityFactsRaw,
  range: { from: string; to: string },
): ServiceFact[] {
  const stopsByKey = new Map<string, ReliabilityPlanStopRow[]>();
  for (const stop of raw.planStops) {
    const k = keyOf(stop.appointmentId, stop.inspectorId);
    const list = stopsByKey.get(k);
    if (list) list.push(stop);
    else stopsByKey.set(k, [stop]);
  }

  const ratingByKey = new Map<string, number>();
  for (const survey of raw.surveys) {
    ratingByKey.set(keyOf(survey.appointmentId, survey.inspectorId), survey.rating);
  }

  const lateNoticesByKey = new Map<string, LateNoticeEvent[]>();
  for (const notice of raw.lateNotices as ReliabilityLateNoticeRow[]) {
    const k = keyOf(notice.appointmentId, notice.inspectorId);
    const event: LateNoticeEvent = { clientOccurredAt: notice.clientOccurredAt, createdAt: notice.createdAt };
    const list = lateNoticesByKey.get(k);
    if (list) list.push(event);
    else lateNoticesByKey.set(k, [event]);
  }

  const stopForScheduledDate = (appointmentId: string, inspectorId: string, scheduledDate: string) =>
    stopsByKey.get(keyOf(appointmentId, inspectorId))?.find((s) => s.planDate === scheduledDate);

  const mostRecentStop = (appointmentId: string, inspectorId: string) => {
    const list = stopsByKey.get(keyOf(appointmentId, inspectorId));
    if (!list || list.length === 0) return undefined;
    return [...list].sort((a, b) => (a.planDate < b.planDate ? 1 : a.planDate > b.planDate ? -1 : 0))[0];
  };

  const facts: ServiceFact[] = [];
  const doneOrNoShowKeys = new Set<string>();

  // DONE occurrences (current + later-rejected)
  for (const row of raw.done) {
    const isLate = row.origin === 'REJECTED_DONE' && (row.serviceDate < range.from || row.serviceDate > range.to);
    const serviceDate = isLate && row.rejectedOn ? row.rejectedOn : row.serviceDate;
    const weight = stopToWeight(stopForScheduledDate(row.appointmentId, row.inspectorId, row.scheduledDate), row.defaultDurationMinutes);
    const kind = row.finishedAt ? 'EXECUTED' : 'DONE_WITHOUT_EXECUTION';
    facts.push({
      inspectorId: row.inspectorId,
      appointmentId: row.appointmentId,
      tenantId: row.tenantId,
      timezone: row.timezone,
      kind,
      origin: row.origin,
      serviceDate,
      doneRejected: row.doneRejected,
      lateRejection: isLate,
      durationMinutes: weight.durationMinutes,
      plannedTravelMinutes: weight.plannedTravelMinutes,
      windowStartAt: zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.timezone),
      windowEndAt: row.timeSlotEnd ? zonedWallTimeToUtc(row.scheduledDate, row.timeSlotEnd, row.timezone) : null,
      startedAt: row.startedAt,
      startClientAt: row.startClientAt,
      finishedAt: row.finishedAt,
      resumedAt: row.resumedAt,
      outOfWindow: row.outOfWindow ?? false,
      publishedEtaAt: weight.publishedEta,
      publishedServiceStartAt: weight.publishedServiceStartAt,
      outOfRadius: row.outOfRadius ?? false,
      finishOutOfRadius: row.finishOutOfRadius ?? false,
      geolocationDistanceMeters: row.geolocationDistanceMeters,
      finishGeolocationDistanceMeters: row.finishGeolocationDistanceMeters,
      startAccuracyM: row.startAccuracyM,
      finishAccuracyM: row.finishAccuracyM,
      geofenceRadiusM: row.geofenceRadiusM,
      rating: ratingByKey.get(keyOf(row.appointmentId, row.inspectorId)) ?? null,
      lateNotices: lateNoticesByKey.get(keyOf(row.appointmentId, row.inspectorId)) ?? [],
      cantAttendNoticeAt: null,
      inspectorCreatedOn: civilDateInTz(row.inspectorCreatedAt, PLATFORM_TIMEZONE),
    });
    doneOrNoShowKeys.add(keyOf(row.appointmentId, row.inspectorId));
  }

  // OP-marked no-shows
  for (const row of raw.noShow) {
    const weight = stopToWeight(mostRecentStop(row.appointmentId, row.inspectorId), row.defaultDurationMinutes);
    facts.push({
      inspectorId: row.inspectorId,
      appointmentId: row.appointmentId,
      tenantId: row.tenantId,
      timezone: row.timezone,
      kind: 'NO_SHOW_REJECTED',
      origin: 'NO_SHOW_REJECTED',
      serviceDate: row.serviceDate,
      doneRejected: false,
      lateRejection: false,
      durationMinutes: weight.durationMinutes,
      plannedTravelMinutes: weight.plannedTravelMinutes,
      windowStartAt: zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.timezone),
      windowEndAt: row.timeSlotEnd ? zonedWallTimeToUtc(row.scheduledDate, row.timeSlotEnd, row.timezone) : null,
      startedAt: null,
      startClientAt: null,
      finishedAt: null,
      resumedAt: null,
      outOfWindow: false,
      publishedEtaAt: null,
      publishedServiceStartAt: null,
      outOfRadius: false,
      finishOutOfRadius: false,
      geolocationDistanceMeters: null,
      finishGeolocationDistanceMeters: null,
      startAccuracyM: null,
      finishAccuracyM: null,
      geofenceRadiusM: null,
      rating: null,
      lateNotices: [],
      cantAttendNoticeAt: null,
      inspectorCreatedOn: civilDateInTz(row.inspectorCreatedAt, PLATFORM_TIMEZONE),
    });
    doneOrNoShowKeys.add(keyOf(row.appointmentId, row.inspectorId));
  }

  // CANT_ATTEND — dropped when the inspector already has a DONE occurrence or a no-show here
  for (const row of raw.cantAttend) {
    if (doneOrNoShowKeys.has(keyOf(row.appointmentId, row.inspectorId))) continue;
    const weight = stopToWeight(mostRecentStop(row.appointmentId, row.inspectorId), row.defaultDurationMinutes);
    facts.push({
      inspectorId: row.inspectorId,
      appointmentId: row.appointmentId,
      tenantId: row.tenantId,
      timezone: row.timezone,
      kind: 'CANT_ATTEND',
      origin: 'CANT_ATTEND',
      serviceDate: row.serviceDate,
      doneRejected: false,
      lateRejection: false,
      durationMinutes: weight.durationMinutes,
      plannedTravelMinutes: weight.plannedTravelMinutes,
      windowStartAt: zonedWallTimeToUtc(row.scheduledDate, row.timeSlotStart, row.timezone),
      windowEndAt: row.timeSlotEnd ? zonedWallTimeToUtc(row.scheduledDate, row.timeSlotEnd, row.timezone) : null,
      startedAt: null,
      startClientAt: null,
      finishedAt: null,
      resumedAt: null,
      outOfWindow: false,
      publishedEtaAt: null,
      publishedServiceStartAt: null,
      outOfRadius: false,
      finishOutOfRadius: false,
      geolocationDistanceMeters: null,
      finishGeolocationDistanceMeters: null,
      startAccuracyM: null,
      finishAccuracyM: null,
      geofenceRadiusM: null,
      rating: null,
      lateNotices: [],
      cantAttendNoticeAt: resolveEffectiveEventTime(row.clientOccurredAt, row.createdAt).effectiveAt,
      inspectorCreatedOn: civilDateInTz(row.inspectorCreatedAt, PLATFORM_TIMEZONE),
    });
  }

  return facts;
}
