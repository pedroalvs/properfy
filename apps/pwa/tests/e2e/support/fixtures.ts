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

/** `POST /v1/auth/login` → 401 error envelope (`{ error: { code, message, details? } }`). */
export const LOGIN_401 = {
  error: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  },
} as const;
