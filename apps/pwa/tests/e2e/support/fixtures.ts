/**
 * Pure E2E response fixtures — NO `@playwright/test` import (imported by the Vitest
 * validator `src/__tests__/e2e-fixtures.test.ts` and by the specs/helpers alike).
 *
 * Every fixture mirrors the canonical `@properfy/shared` response schema for its
 * route and is strict-parse-validated by that Vitest test, so a mock can never
 * drift from the contract. Ids are valid v4 uuids, civil dates are `YYYY-MM-DD`,
 * instants are ISO strings. See `specs/036-x03-pwa-e2e-recovery/data-model.md`.
 */

/** Deterministic, valid v4 uuid (version nibble 4, variant 8) for fixtures. */
export function fixtureUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

// A fixed civil date used by the constant month fixtures (the specs that depend on
// "today" rebuild the envelope with the Sydney-computed date — see schedule.spec.ts).
const SAMPLE_DATE = '2026-03-20';

/** `GET /v1/me` — PLAIN (no `data` envelope). meResponseSchema. */
export const INSPECTOR_ME = {
  id: fixtureUuid(1),
  name: 'E2E Inspector',
  email: 'inspector@e2e.test',
  role: 'INSP',
  tenantId: null,
  branchId: null,
  totpEnabled: false,
  phone: null,
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  inspectorId: fixtureUuid(2),
  timezone: 'Australia/Sydney',
  personalTimezone: null,
} as const;

/** One `inspectorScheduleMonthItemSchema` item. The schedule spec overrides `scheduledDate`. */
export const SCHEDULE_APPOINTMENT = {
  id: fixtureUuid(30),
  appointmentCode: 'INS-0042',
  // propertyCode is present in the payload to prove the schedule card hides it.
  propertyCode: 'ACM-PROP-0007',
  status: 'SCHEDULED',
  scheduledDate: SAMPLE_DATE,
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  serviceTypeId: fixtureUuid(31),
  propertyId: fixtureUuid(32),
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'NOT_STARTED',
  agencyName: 'Acme Realty',
  propertyAddress: '123 Collins St',
  suburb: 'Melbourne',
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
} as const;

type ScheduleItem = typeof SCHEDULE_APPOINTMENT;

/** Build an `inspectorScheduleMonthResponseSchema` payload anchored on one civil date. */
export function makeScheduleMonth(today: string, appointments: ScheduleItem[] = []) {
  return {
    today,
    from: today,
    to: today,
    days: appointments.length
      ? [{ date: today, count: appointments.length, hasUrgent: false }]
      : [],
    appointments,
    overdueAppointments: [],
  };
}

/** `GET /v1/inspector/schedule/month` — inside `{ data }`. inspectorScheduleMonthResponseSchema. */
export const SCHEDULE_MONTH_EMPTY = makeScheduleMonth(SAMPLE_DATE);
export const SCHEDULE_MONTH_ONE = makeScheduleMonth(SAMPLE_DATE, [SCHEDULE_APPOINTMENT]);

/** Item of `GET /v1/marketplace/offers` (`{ data, pagination }`). marketplaceOfferResponseSchema. */
export const OFFER = {
  groupId: fixtureUuid(50),
  groupNumber: 1057,
  code: '1057',
  tenantName: 'Acme Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: SAMPLE_DATE,
  timeWindow: '09:00-11:00',
  suburbs: ['Brunswick', 'Fitzroy'],
  payoutEstimate: 240,
  appointmentCount: 3,
  centroid: null,
  properties: [
    { street: '12 Ocean St', suburb: 'Brunswick VIC', propertyType: 'APARTMENT' },
    { street: '3 Beach Rd', suburb: 'Fitzroy VIC', propertyType: 'HOUSE' },
    { street: '7 Hill St', suburb: 'Fitzroy VIC', propertyType: 'HOUSE' },
  ],
} as const;

/** `GET /v1/marketplace/offers/:groupId` (`{ data }`). marketplaceOfferDetailResponseSchema. */
export const OFFER_DETAIL = {
  ...OFFER,
  addresses: ['12 Ocean St, Brunswick VIC', '3 Beach Rd, Fitzroy VIC'],
  keyRequired: false,
  notes: null,
  appointments: [
    {
      id: fixtureUuid(51),
      appointmentCode: 'INS-1001',
      appointmentNumber: 1001,
      suburb: 'Brunswick VIC',
      keyRequired: false,
      notes: null,
      payoutAmount: 80,
      tenantName: 'Acme Realty',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      street: '12 Ocean St',
      coordinates: null,
      propertyType: 'APARTMENT',
    },
    {
      id: fixtureUuid(52),
      appointmentCode: 'INS-1002',
      appointmentNumber: 1002,
      suburb: 'Fitzroy VIC',
      keyRequired: false,
      notes: null,
      payoutAmount: 160,
      tenantName: 'Acme Realty',
      timeSlotStart: '10:30',
      timeSlotEnd: '11:30',
      street: '3 Beach Rd',
      coordinates: null,
      propertyType: 'HOUSE',
    },
  ],
} as const;

/** Appointment id used by the execution-finish flow (must be a uuid — schema `id` is uuid). */
export const APPOINTMENT_ID = fixtureUuid(10);

/** `GET /v1/inspector/appointments/:id` (`{ data }`). inspectorAppointmentDetailResponseSchema. */
export const APPOINTMENT_DETAIL = {
  id: APPOINTMENT_ID,
  status: 'SCHEDULED',
  scheduledDate: SAMPLE_DATE,
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  serviceTypeId: fixtureUuid(11),
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
  propertyId: fixtureUuid(12),
  propertyAddress: '123 E2E St, Sydney',
  suburb: 'Sydney',
  propertyLatitude: -33.8688,
  propertyLongitude: 151.2093,
  rentalTenantConfirmationStatus: 'CONFIRMED',
  rentalTenantConfirmation: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  keyLocation: null,
  rentalTenantName: 'Jane Tenant',
  rentalTenantPhone: null,
  rentalTenantEmail: null,
  notes: null,
  rentalTenantNote: null,
  observation: null,
  restrictionsSummary: null,
  contact: null,
  restrictions: [],
  execution: null,
  apps: [],
  jobDetails: {
    agency: { id: fixtureUuid(13), name: 'E2E Agency' },
    tenantContacts: [],
    keys: { keyRequired: false, keyLocation: null },
    propertyManager: null,
    payment: { payoutAmount: 100, currency: 'AUD' },
  },
} as const;

/** `POST …/finish` (`{ data }`). finishInspectionResponseSchema. */
export const FINISH_RESULT = {
  executionId: fixtureUuid(20),
  appointmentId: APPOINTMENT_ID,
  startedAt: '2026-07-20T09:05:00.000Z',
  finishedAt: '2026-07-20T09:30:00.000Z',
  appointmentStatus: 'DONE',
} as const;

/**
 * `GET /v1/inspectors/me` inner body (the stub wraps it in `{ data }`).
 * inspectorResponseSchema. `onboardingCompletedAt: null` = tour not yet done.
 */
export function makeInspectorProfile(onboardingCompletedAt: string | null) {
  return {
    id: INSPECTOR_ME.inspectorId,
    name: INSPECTOR_ME.name,
    email: INSPECTOR_ME.email,
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: null,
    serviceTypesJson: null,
    onboardingCompletedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as const;
}

/** First-access: the tour must auto-open. */
export const INSPECTOR_PROFILE_TOUR_PENDING = makeInspectorProfile(null);
/** Already onboarded: the tour must not auto-open. */
export const INSPECTOR_PROFILE_TOUR_DONE = makeInspectorProfile('2026-10-30T00:00:00.000Z');

/**
 * `GET /v1/inspector/day-plans/:date` inner body (the stub wraps it in `{ data }`).
 * dayPlanResponseSchema. A published plan with one SCHEDULED stop so the Today
 * screen renders the Next-inspection card, its action bar and the route link
 * (the tour's phone-layout anchors).
 */
const TOUR_STOP_ID = '11111111-1111-4111-8111-111111111111';
export const DAY_PLAN_TODAY = {
  id: '44444444-4444-4444-8444-444444444444',
  inspectorId: INSPECTOR_ME.inspectorId,
  inspectorName: INSPECTOR_ME.name,
  date: '2026-11-05',
  timezone: 'Australia/Sydney',
  status: 'PUBLISHED',
  version: 1,
  publishedAt: '2026-11-04T08:30:00.000Z',
  computedAt: '2026-11-04T08:30:00.000Z',
  lastTrigger: 'SCHEDULED_PUBLISH',
  approximate: false,
  approximateReason: null,
  routingProvider: 'MAPBOX',
  matrixProfile: 'driving-traffic',
  optimizerMethod: 'EXACT',
  origin: { source: 'BASE', label: 'Surry Hills NSW', lat: -33.88, lng: 151.21 },
  originWarning: null,
  originOverride: null,
  departureAt: '2026-11-04T20:50:00.000Z',
  finishEta: '2026-11-04T21:45:00.000Z',
  totals: { driveS: 600, waitS: 0, serviceS: 2700, lateS: 0, distanceM: 4700 },
  feasible: true,
  violations: [],
  manualOrder: false,
  suggestedOrder: [TOUR_STOP_ID],
  stops: [
    {
      appointmentId: TOUR_STOP_ID,
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
    },
  ],
  geometry: null,
  routingInput: null,
} as const;

/** `POST /v1/auth/login` → 401 error envelope (`{ error: { code, message, details? } }`). */
export const LOGIN_401 = {
  error: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  },
} as const;
