import type { DayPlanResponse, DayPlanStop } from '@properfy/shared';

/**
 * Test fixtures for the day plan, built to match `dayPlanResponseSchema` exactly
 * (asserted in `day-plan.fixture.test.ts`). Mirrors the "Exemplo de resposta" of
 * TASK-F04-1 (Sydney, 2026-11-05) with real UUIDs. Use `buildDayPlan`/`buildStop`
 * with overrides; never hand-write a plan in a test.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

export const STOP_IDS = { A, B, C } as const;

export function buildStop(overrides: Partial<DayPlanStop> = {}): DayPlanStop {
  return {
    appointmentId: A,
    sequence: 1,
    appointmentCode: 'INS-0042',
    agencyName: 'Ray White Surry Hills',
    appointmentStatus: 'SCHEDULED',
    executionStatus: 'NOT_STARTED',
    eta: '2026-11-04T21:00:00.000Z',
    serviceStartAt: '2026-11-04T21:00:00.000Z',
    serviceEndAt: '2026-11-04T21:45:00.000Z',
    travelS: 600,
    distanceM: 4700,
    waitS: 0,
    lateS: 0,
    windowStart: '08:00',
    windowEnd: '17:00',
    windowStartAt: '2026-11-04T21:00:00.000Z',
    windowEndAt: '2026-11-05T06:00:00.000Z',
    timezone: 'Australia/Sydney',
    durationMinutes: 45,
    manual: false,
    executed: false,
    approximate: false,
    missingCoordinates: false,
    lat: -33.8836,
    lng: 151.2108,
    propertyAddress: '12 King St, Surry Hills NSW 2010',
    suburb: 'Surry Hills',
    serviceTypeName: 'Routine',
    keyRequired: false,
    meetingLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    primaryContact: { name: 'Sam Lee', phone: '+61412345678', role: 'RENTAL_TENANT' },
    ...overrides,
  };
}

/** Three sequenced stops (A, B, C) with distinct coordinates and ETAs. */
export function buildStops(): DayPlanStop[] {
  return [
    buildStop({ appointmentId: A, sequence: 1 }),
    buildStop({
      appointmentId: B,
      sequence: 2,
      appointmentCode: 'INS-0043',
      eta: '2026-11-04T21:55:00.000Z',
      serviceStartAt: '2026-11-04T21:55:00.000Z',
      serviceEndAt: '2026-11-04T22:40:00.000Z',
      travelS: 600,
      distanceM: 5000,
      lat: -33.89,
      lng: 151.22,
      propertyAddress: '2/246 Willoughby Rd, Naremburn NSW 2065',
      suburb: 'Naremburn',
    }),
    buildStop({
      appointmentId: C,
      sequence: 3,
      appointmentCode: 'INS-0044',
      eta: '2026-11-04T22:50:00.000Z',
      serviceStartAt: '2026-11-04T22:50:00.000Z',
      serviceEndAt: '2026-11-04T23:35:00.000Z',
      travelS: 600,
      distanceM: 4500,
      lat: -33.87,
      lng: 151.2,
      propertyAddress: '9 Cleveland St, Redfern NSW 2016',
      suburb: 'Redfern',
    }),
  ];
}

export function buildDayPlan(overrides: Partial<DayPlanResponse> = {}): DayPlanResponse {
  const stops = overrides.stops ?? buildStops();
  return {
    id: '44444444-4444-4444-8444-444444444444',
    inspectorId: '55555555-5555-4555-8555-555555555555',
    inspectorName: 'Jane Doe',
    date: '2026-11-05',
    timezone: 'Australia/Sydney',
    status: 'PUBLISHED',
    version: 3,
    publishedAt: '2026-11-04T08:30:12.000Z',
    computedAt: '2026-11-04T08:30:12.000Z',
    lastTrigger: 'SCHEDULED_PUBLISH',
    approximate: false,
    approximateReason: null,
    routingProvider: 'MAPBOX',
    matrixProfile: 'driving-traffic',
    optimizerMethod: 'EXACT',
    origin: { source: 'BASE', label: 'Redfern NSW 2016', lat: -33.87, lng: 151.2 },
    originWarning: null,
    originOverride: null,
    departureAt: '2026-11-04T20:50:00.000Z',
    finishEta: '2026-11-04T23:35:00.000Z',
    totals: { driveS: 1800, waitS: 0, serviceS: 8100, lateS: 0, distanceM: 14200 },
    feasible: true,
    violations: [],
    manualOrder: false,
    suggestedOrder: stops.map((s) => s.appointmentId),
    stops,
    geometry: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[151.2, -33.87], [151.2108, -33.8836]] },
          properties: { fromSequence: 0, toSequence: 1, approximate: false },
        },
      ],
    },
    ...overrides,
  };
}
