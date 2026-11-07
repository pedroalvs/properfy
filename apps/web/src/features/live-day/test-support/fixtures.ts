import type { LiveDayAlert, LiveDayInspector, LiveDayResponse, LiveDayStop } from '@properfy/shared';

/**
 * Test fixtures for the Live Day feature, shared by the row, detail and page
 * tests. Defaults describe a healthy "today" inspector; override per test.
 */

export function makeAlert(over: Partial<LiveDayAlert> = {}): LiveDayAlert {
  return {
    type: 'DELAY',
    occurredAt: '2026-11-05T10:00:00+11:00',
    appointmentId: null,
    appointmentCode: null,
    minutes: null,
    estimatedArrivalAt: null,
    thresholdMinutes: null,
    thresholdSource: null,
    reason: null,
    reasonLabel: null,
    note: null,
    phase: null,
    distanceMeters: null,
    radiusMeters: null,
    ...over,
  } as LiveDayAlert;
}

export function makeStop(over: Partial<LiveDayStop> = {}): LiveDayStop {
  return {
    appointmentId: over.appointmentId ?? 'stop-a',
    appointmentCode: over.appointmentCode ?? 'INS-0042',
    sequence: over.sequence ?? 1,
    inPlan: over.inPlan ?? true,
    progress: over.progress ?? 'REMAINING',
    agencyName: over.agencyName ?? 'Ray White',
    propertyAddress: over.propertyAddress ?? '14 Crown St',
    suburb: over.suburb ?? 'Surry Hills',
    lat: over.lat ?? -33.88,
    lng: over.lng ?? 151.21,
    missingCoordinates: over.missingCoordinates ?? false,
    windowStart: over.windowStart ?? '08:00',
    windowEnd: over.windowEnd ?? '17:00',
    timezone: over.timezone ?? 'Australia/Sydney',
    startedAt: over.startedAt ?? null,
    finishedAt: over.finishedAt ?? null,
    predictedStartAt: over.predictedStartAt ?? null,
    publishedStartAt: over.publishedStartAt ?? null,
    delayMinutes: over.delayMinutes ?? null,
  } as unknown as LiveDayStop;
}

export function makeInspector(over: Partial<LiveDayInspector> = {}): LiveDayInspector {
  return {
    inspectorId: over.inspectorId ?? 'insp-1',
    inspectorName: over.inspectorName ?? 'Jane Doe',
    state: over.state ?? 'AT_PROPERTY',
    lastKnown: over.lastKnown ?? {
      source: 'CHECK_IN',
      lat: -33.88,
      lng: 151.21,
      at: '2026-11-05T10:17:00+11:00',
      appointmentId: 'stop-a',
      label: null,
    },
    progress: over.progress ?? { done: 1, inProgress: 1, remaining: 1, total: 3 },
    delayMinutes: over.delayMinutes ?? 22,
    thresholds: over.thresholds ?? {
      delayMinutes: 20,
      delaySource: 'PLATFORM',
      notStartedMinutes: 30,
      notStartedSource: 'PLATFORM',
    },
    alerts: over.alerts ?? [],
    needsAttention: over.needsAttention ?? (over.alerts?.length ?? 0) > 0,
    dayPlanId: over.dayPlanId ?? 'plan-1',
    planStatus: over.planStatus ?? 'PUBLISHED',
    planVersion: over.planVersion ?? 1,
    routeOutOfDate: over.routeOutOfDate ?? false,
    routeApproximate: over.routeApproximate ?? true,
    routeFeasible: over.routeFeasible ?? true,
    routeViolations: over.routeViolations ?? [],
    origin: over.origin ?? { lat: -33.87, lng: 151.2, label: 'Base' },
    geometryIncluded: over.geometryIncluded ?? false,
    geometry: over.geometry ?? null,
    stops: over.stops ?? [makeStop()],
    ...over,
  } as unknown as LiveDayInspector;
}

export function makeLiveDayResponse(over: Partial<LiveDayResponse> = {}): LiveDayResponse {
  const inspectors = over.inspectors ?? [makeInspector()];
  return {
    date: over.date ?? '2026-11-05',
    today: over.today ?? '2026-11-05',
    timezone: over.timezone ?? 'Australia/Sydney',
    isToday: over.isToday ?? true,
    generatedAt: over.generatedAt ?? '2026-11-05T10:31:00+11:00',
    thresholdsDefault: over.thresholdsDefault ?? { delayMinutes: 20, notStartedMinutes: 30 },
    summary: over.summary ?? {
      inspectors: inspectors.length,
      notStarted: 0,
      atProperty: 1,
      inTransit: 0,
      doneForDay: 0,
      needsAttention: inspectors.filter((i) => i.needsAttention).length,
      stopsDone: 1,
      stopsTotal: 3,
    },
    inspectors,
  } as LiveDayResponse;
}

/** Wrap a response in the `{ data: { data } }` success envelope the api client returns. */
export function envelope(resp: LiveDayResponse) {
  return { data: { data: resp }, error: undefined };
}
