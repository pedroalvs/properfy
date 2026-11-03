import type { DayPlanResponse, DayPlanStop as DayPlanStopDto } from '@properfy/shared';
import { selectPrimaryContact } from '../domain/primary-contact';
import type { DayPlanCandidate, InspectorDayPlanContext } from '../domain/day-plan-input.reader';
import type { DayPlanRecord, DayPlanStopRecord } from '../domain/day-plan.entity';
import type { OnDemandRouting } from './recompute-routing';

function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function executionStatus(c: DayPlanCandidate | undefined): 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' {
  if (!c) return 'NOT_STARTED';
  if (c.finishedAt !== null) return 'FINISHED';
  if (c.startedAt !== null && c.abandonedAt === null) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

/** Live `executed` (D18): DONE, or started-and-not-abandoned — derived from current state, not the stored flag. */
function liveExecuted(c: DayPlanCandidate | undefined): boolean {
  if (!c) return false;
  return c.appointmentStatus === 'DONE' || (c.startedAt !== null && c.abandonedAt === null);
}

function originLabel(record: DayPlanRecord, inspector: InspectorDayPlanContext, lastExecuted: DayPlanCandidate | null): string | null {
  const addressLabel = (a: { suburb: string; state: string; postcode: string } | null): string | null =>
    a ? `${a.suburb} ${a.state} ${a.postcode}`.trim() : null;
  switch (record.originSource) {
    case 'OVERRIDE':
      return addressLabel(record.originOverride as { suburb: string; state: string; postcode: string } | null);
    case 'BASE':
      return addressLabel(inspector.baseAddress as { suburb: string; state: string; postcode: string } | null);
    case 'LAST_STOP':
      return lastExecuted?.suburb ?? null;
    default:
      return null;
  }
}

export function buildDayPlanResponse(
  record: DayPlanRecord,
  candidates: DayPlanCandidate[],
  inspector: InspectorDayPlanContext,
  now: Date,
  isToday: boolean,
  /** On-demand routing (Plan B). When absent, falls back to the record stored fields (always empty). */
  routing?: OnDemandRouting,
): DayPlanResponse {
  const byId = new Map(candidates.map((c) => [c.appointmentId, c] as const));
  const executedCandidates = record.stops
    .filter((s) => liveExecuted(byId.get(s.appointmentId)))
    .map((s) => byId.get(s.appointmentId))
    .filter((c): c is DayPlanCandidate => c !== undefined);
  const lastExecuted = executedCandidates.length > 0 ? executedCandidates[executedCandidates.length - 1]! : null;

  const stops: DayPlanStopDto[] = record.stops.map((s: DayPlanStopRecord) => {
    const c = byId.get(s.appointmentId);
    const contact = c ? selectPrimaryContact(c.contacts) : null;
    return {
      appointmentId: s.appointmentId,
      sequence: s.sequence,
      appointmentCode: c?.appointmentCode ?? '',
      agencyName: c?.agencyName ?? '',
      appointmentStatus: (c?.appointmentStatus ?? 'SCHEDULED') as 'SCHEDULED' | 'DONE',
      executionStatus: executionStatus(c),
      eta: iso(s.eta),
      serviceStartAt: iso(s.serviceStartAt),
      serviceEndAt: iso(s.serviceEndAt),
      travelS: s.travelS,
      distanceM: s.distanceM,
      waitS: s.waitS,
      lateS: s.lateS,
      windowStart: c?.timeSlotStart ?? '',
      windowEnd: c?.timeSlotEnd ?? '',
      windowStartAt: s.windowStartAt.toISOString(),
      windowEndAt: s.windowEndAt.toISOString(),
      timezone: s.windowTimezone,
      durationMinutes: s.durationMinutes,
      manual: s.manual,
      executed: liveExecuted(c),
      approximate: s.approximate,
      missingCoordinates: s.missingCoordinates,
      lat: s.lat,
      lng: s.lng,
      propertyAddress: c?.propertyAddress ?? '',
      suburb: c?.suburb ?? '',
      serviceTypeName: c?.serviceTypeName ?? '',
      keyRequired: c?.keyRequired ?? false,
      meetingLocation: c?.meetingLocation ?? null,
      rentalTenantConfirmationStatus: c?.rentalTenantConfirmationStatus ?? '',
      primaryContact: contact,
    };
  });

  const reorderableWithCoords = record.stops.filter((s) => !liveExecuted(byId.get(s.appointmentId)) && s.lat !== null);
  const matrix = routing ? routing.matrix : record.routingMatrix;
  const legs = routing ? routing.legs : (record.legTravel ?? []);
  const routingInput =
    matrix && reorderableWithCoords.length >= 2
      ? {
          points: matrix.points,
          travelS: matrix.travelS,
          originKey: (record.originSource === 'NONE' ? null : ('origin' as const)),
          earliestDepartureAt: isToday ? iso(new Date(Math.max(now.getTime(), (record.departureAt ?? now).getTime()))) : null,
          weights: record.weights,
          legTravelS: legs,
        }
      : null;

  return {
    id: record.id,
    inspectorId: record.inspectorId,
    inspectorName: inspector.name,
    date: record.planDate,
    timezone: record.timezone,
    status: record.status,
    version: record.version,
    publishedAt: iso(record.publishedAt),
    computedAt: record.computedAt.toISOString(),
    lastTrigger: record.lastTrigger,
    approximate: routing ? record.approximate || routing.approximate : record.approximate,
    approximateReason: (routing && routing.approximate
      ? routing.approximateReason
      : record.approximateReason) as DayPlanResponse['approximateReason'],
    routingProvider: record.routingProvider,
    matrixProfile: record.matrixProfile as DayPlanResponse['matrixProfile'],
    optimizerMethod: record.optimizerMethod as DayPlanResponse['optimizerMethod'],
    origin: {
      source: record.originSource,
      label: originLabel(record, inspector, lastExecuted),
      lat: record.originLat,
      lng: record.originLng,
    },
    originWarning:
      record.originSource === 'NONE'
        ? inspector.baseGeocodeFailed
          ? 'BASE_NOT_LOCATED'
          : 'NO_BASE'
        : null,
    originOverride: record.originOverride
      ? { address: record.originOverride, setAt: (record.originOverrideSetAt ?? record.computedAt).toISOString() }
      : null,
    departureAt: iso(record.departureAt),
    finishEta: iso(record.finishEta),
    totals: {
      driveS: record.totalDriveS,
      waitS: record.totalWaitS,
      serviceS: record.totalServiceS,
      lateS: record.totalLateS,
      distanceM: record.totalDistanceM,
    },
    feasible: record.feasible,
    violations: record.stops.filter((s) => s.lateS > 0).map((s) => ({ appointmentId: s.appointmentId, lateS: s.lateS })),
    manualOrder: record.manualOrder,
    suggestedOrder: record.suggestedOrder,
    stops,
    geometry: routing ? routing.geometry : record.routeGeometry,
    routingInput,
  };
}
