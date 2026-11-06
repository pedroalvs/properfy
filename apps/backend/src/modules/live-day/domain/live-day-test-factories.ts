/**
 * Flat-row factories for the Live Day domain unit tests. Every field has a sane
 * default so a test overrides only what it exercises. Not part of the runtime
 * graph (imported only by `*.test.ts`), so it is never shipped in the build.
 */
import type {
  LiveDayStopRow,
  LiveDayEventRow,
  LiveDayReminderRow,
  LiveDayInspectorRow,
} from './live-day.read-repository';

export function makeStopRow(overrides: Partial<LiveDayStopRow> = {}): LiveDayStopRow {
  return {
    appointmentId: '00000000-0000-4000-8000-000000000001',
    appointmentNumber: 42,
    inspectorId: '00000000-0000-4000-8000-0000000000aa',
    status: 'SCHEDULED',
    tenantId: '00000000-0000-4000-8000-0000000000b1',
    scheduledDate: '2026-11-05',
    timeSlotStart: '08:00',
    timeSlotEnd: '17:00',
    keyRequired: false,
    confirmationStatus: 'CONFIRMED',
    agencyName: 'Ray White Surry Hills',
    tenantTimezone: 'Australia/Sydney',
    appointmentCodePrefix: 'RWS',
    defaultDurationMinutes: 45,
    flowType: 'ROUTINE',
    requiresRentalTenantConfirmation: true,
    street: '12 King St',
    suburb: 'Surry Hills',
    propertyState: 'NSW',
    postcode: '2010',
    propertyLat: -33.8836,
    propertyLng: 151.2108,
    startedAt: null,
    finishedAt: null,
    abandonedAt: null,
    startLat: null,
    startLng: null,
    finishLat: null,
    finishLng: null,
    outOfRadius: null,
    finishOutOfRadius: null,
    outOfWindow: null,
    geofenceRadiusM: null,
    geolocationDistanceMeters: null,
    finishGeolocationDistanceMeters: null,
    planId: '00000000-0000-4000-8000-0000000000c1',
    sequence: 1,
    travelS: 600,
    stopDurationMinutes: 45,
    serviceStartAt: '2026-11-04T21:00:00.000Z',
    serviceEndAt: '2026-11-04T21:45:00.000Z',
    publishedServiceStartAt: '2026-11-04T21:00:00.000Z',
    windowStartAt: '2026-11-04T21:00:00.000Z',
    windowEndAt: '2026-11-05T06:00:00.000Z',
    windowTimezone: 'Australia/Sydney',
    missingCoordinates: false,
    lateS: null,
    ...overrides,
  };
}

export function makeEventRow(overrides: Partial<LiveDayEventRow> = {}): LiveDayEventRow {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    inspectorId: '00000000-0000-4000-8000-0000000000aa',
    type: 'CANT_DO',
    appointmentId: '00000000-0000-4000-8000-000000000001',
    reasonCode: 'NO_ANSWER',
    note: null,
    minutes: null,
    createdAt: '2026-11-04T22:00:00.000Z',
    clientOccurredAt: null,
    apptTimeSlotStart: '08:00',
    apptScheduledDate: '2026-11-05',
    apptTenantTimezone: 'Australia/Sydney',
    appointmentNumber: 42,
    tenantId: '00000000-0000-4000-8000-0000000000b1',
    appointmentCodePrefix: 'RWS',
    apptStatus: 'REJECTED',
    apptInspectorId: null,
    cantDoActive: true,
    ...overrides,
  };
}

export function makeReminderRow(overrides: Partial<LiveDayReminderRow> = {}): LiveDayReminderRow {
  return {
    dedupeKey: 'completion-reminder:00000000-0000-4000-8000-000000000001:2026-11-05:00000000-0000-4000-8000-0000000000aa',
    createdAt: '2026-11-05T07:00:00.000Z',
    ...overrides,
  };
}

export function makeInspectorRow(overrides: Partial<LiveDayInspectorRow> = {}): LiveDayInspectorRow {
  return {
    inspectorId: '00000000-0000-4000-8000-0000000000aa',
    inspectorName: 'Jane Doe',
    baseLat: -33.87,
    baseLng: 151.2,
    alertOverridesJson: null,
    planId: '00000000-0000-4000-8000-0000000000c1',
    planStatus: 'PUBLISHED',
    planVersion: 4,
    planTimezone: 'Australia/Sydney',
    inputFingerprint: null,
    departureAt: '2026-11-04T20:30:00.000Z',
    originSource: 'BASE',
    originLat: -33.87,
    originLng: 151.2,
    originOverrideLat: null,
    originOverrideLng: null,
    approximate: false,
    feasible: true,
    plannedCount: 1,
    stops: [],
    events: [],
    reminders: [],
    ...overrides,
  };
}
