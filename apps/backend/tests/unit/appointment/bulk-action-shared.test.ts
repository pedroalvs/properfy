/**
 * `bulk-action-shared` covers the helpers shared by the four 025 bulk
 * use cases: `dayKeyInTz` (timezone-aware YYYY-MM-DD bucketing) and the
 * error-class → typed-status mapper. The actual end-to-end semantics
 * live in each per-use-case test; this file guards the mapper table so
 * mis-typed errors don't silently collapse into the catch-all `ERROR`.
 */

import { describe, it, expect } from 'vitest';
import {
  dayKeyInTz,
  mapErrorToResult,
  mapBulkEditFailureToResult,
} from '../../../src/modules/appointment/application/use-cases/bulk-action-shared';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentServiceGroupRequiredError,
  AppointmentInspectorRequiredError,
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
} from '../../../src/modules/appointment/domain/appointment.errors';

const APPT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('dayKeyInTz', () => {
  it('produces a YYYY-MM-DD string for a UTC instant in Sydney TZ', () => {
    expect(dayKeyInTz(new Date('2026-04-15T13:00:00Z'), 'Australia/Sydney')).toBe('2026-04-15');
    expect(dayKeyInTz(new Date('2026-04-15T14:30:00Z'), 'Australia/Sydney')).toBe('2026-04-16');
  });

  it('returns different keys for the same instant across timezones', () => {
    const instant = new Date('2026-04-15T01:00:00Z');
    expect(dayKeyInTz(instant, 'Australia/Sydney')).toBe('2026-04-15');
    expect(dayKeyInTz(instant, 'America/New_York')).toBe('2026-04-14');
  });

  it('falls back to UTC silently on invalid timezone', () => {
    expect(dayKeyInTz(new Date('2026-04-15T12:00:00Z'), 'Not/AZone')).toBe('2026-04-15');
  });
});

describe('mapErrorToResult', () => {
  it('maps AppointmentNotFoundError → NOT_FOUND', () => {
    const r = mapErrorToResult(APPT_ID, new AppointmentNotFoundError());
    expect(r.status).toBe('NOT_FOUND');
    expect(r.appointmentId).toBe(APPT_ID);
  });

  it('maps generic NotFoundError → NOT_FOUND', () => {
    const r = mapErrorToResult(APPT_ID, new NotFoundError('FOO_NOT_FOUND', 'gone'));
    expect(r.status).toBe('NOT_FOUND');
    expect(r.error?.code).toBe('FOO_NOT_FOUND');
  });

  it('maps AppointmentAccessDeniedError → FORBIDDEN', () => {
    const r = mapErrorToResult(APPT_ID, new AppointmentAccessDeniedError());
    expect(r.status).toBe('FORBIDDEN');
  });

  it('maps AppointmentTransitionNotPermittedError → FORBIDDEN', () => {
    const r = mapErrorToResult(APPT_ID, new AppointmentTransitionNotPermittedError());
    expect(r.status).toBe('FORBIDDEN');
  });

  it('maps generic ForbiddenError (CL_USER flag denial) → FORBIDDEN', () => {
    const r = mapErrorToResult(APPT_ID, new ForbiddenError('CL_USER_FLAG_REQUIRED', 'flag off'));
    expect(r.status).toBe('FORBIDDEN');
    expect(r.error?.code).toBe('CL_USER_FLAG_REQUIRED');
  });

  it('maps AppointmentInvalidTransitionError → INVALID_TRANSITION', () => {
    const r = mapErrorToResult(APPT_ID, new AppointmentInvalidTransitionError('DRAFT', 'DONE'));
    expect(r.status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentReasonRequiredError → INVALID_TRANSITION', () => {
    expect(mapErrorToResult(APPT_ID, new AppointmentReasonRequiredError()).status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentServiceGroupRequiredError → INVALID_TRANSITION', () => {
    expect(mapErrorToResult(APPT_ID, new AppointmentServiceGroupRequiredError()).status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentInspectorRequiredError → INVALID_TRANSITION', () => {
    expect(mapErrorToResult(APPT_ID, new AppointmentInspectorRequiredError()).status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentUpdateNotAllowedError → INVALID_TRANSITION', () => {
    expect(mapErrorToResult(APPT_ID, new AppointmentUpdateNotAllowedError()).status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentPastDateError → INVALID_TRANSITION', () => {
    expect(mapErrorToResult(APPT_ID, new AppointmentPastDateError()).status).toBe('INVALID_TRANSITION');
  });

  it('falls through unknown Error → ERROR with INTERNAL_ERROR code', () => {
    const r = mapErrorToResult(APPT_ID, new Error('boom'));
    expect(r.status).toBe('ERROR');
    expect(r.error?.code).toBe('INTERNAL_ERROR');
    expect(r.error?.message).toBe('boom');
  });

  it('non-Error thrown values → ERROR with unknown message', () => {
    const r = mapErrorToResult(APPT_ID, 'string thrown');
    expect(r.status).toBe('ERROR');
    expect(r.error?.code).toBe('INTERNAL_ERROR');
  });
});

describe('mapBulkEditFailureToResult', () => {
  it('APPOINTMENT_NOT_FOUND → NOT_FOUND', () => {
    expect(
      mapBulkEditFailureToResult({ id: APPT_ID, code: 'APPOINTMENT_NOT_FOUND', message: 'gone' }).status,
    ).toBe('NOT_FOUND');
  });

  it('APPOINTMENT_UPDATE_NOT_ALLOWED → INVALID_TRANSITION', () => {
    expect(
      mapBulkEditFailureToResult({ id: APPT_ID, code: 'APPOINTMENT_UPDATE_NOT_ALLOWED', message: 'x' }).status,
    ).toBe('INVALID_TRANSITION');
  });

  it('INSPECTOR_INACTIVE → FORBIDDEN', () => {
    expect(
      mapBulkEditFailureToResult({ id: APPT_ID, code: 'INSPECTOR_INACTIVE', message: 'x' }).status,
    ).toBe('FORBIDDEN');
  });

  it('INSPECTOR_NOT_ELIGIBLE → FORBIDDEN', () => {
    expect(
      mapBulkEditFailureToResult({ id: APPT_ID, code: 'INSPECTOR_NOT_ELIGIBLE', message: 'x' }).status,
    ).toBe('FORBIDDEN');
  });

  it('unknown bulk-edit code → ERROR', () => {
    expect(
      mapBulkEditFailureToResult({ id: APPT_ID, code: 'SOMETHING_UNEXPECTED', message: 'x' }).status,
    ).toBe('ERROR');
  });
});
