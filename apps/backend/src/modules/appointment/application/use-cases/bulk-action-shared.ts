import type { BulkActionResultItem, BulkActionResultStatus } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import {
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentServiceGroupRequiredError,
  AppointmentInspectorRequiredError,
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
  AppointmentTenantConfirmationRequiredError,
} from '../../domain/appointment.errors';

/**
 * YYYY-MM-DD day key in the platform timezone (Sydney) for per-day idempotency
 * bucketing. Matches `bulk-resend-reminder.use-case.ts` (023 §FR-243) so all
 * bulk operations share the same key convention.
 */
export function dayKeyInTz(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Map a thrown error from a per-item operation to the bulk-action result
 * envelope. Known domain errors map to typed statuses; anything else falls
 * back to `ERROR` so the batch can continue without exposing internals.
 */
export function mapErrorToResult(appointmentId: string, err: unknown): BulkActionResultItem {
  // 404 — not found (or out of tenant scope, collapsed to 404 per FR-022)
  if (err instanceof NotFoundError) {
    return {
      appointmentId,
      status: 'NOT_FOUND',
      error: { code: err.code, message: err.message },
    };
  }
  // 403 — explicit forbidden (covers AppointmentAccessDeniedError,
  // AppointmentTransitionNotPermittedError, and CL_USER permission denials)
  if (
    err instanceof ForbiddenError
    || err instanceof AppointmentAccessDeniedError
    || err instanceof AppointmentTransitionNotPermittedError
  ) {
    return {
      appointmentId,
      status: 'FORBIDDEN',
      error: { code: err.code, message: err.message },
    };
  }
  // Invalid transitions, reason requirements, prerequisite failures — all
  // surface as INVALID_TRANSITION so the modal can flag the row without
  // aborting siblings.
  if (
    err instanceof AppointmentInvalidTransitionError
    || err instanceof AppointmentReasonRequiredError
    || err instanceof AppointmentServiceGroupRequiredError
    || err instanceof AppointmentInspectorRequiredError
    || err instanceof AppointmentUpdateNotAllowedError
    || err instanceof AppointmentPastDateError
    || err instanceof AppointmentTenantConfirmationRequiredError
  ) {
    const e = err as { code: string; message: string };
    return {
      appointmentId,
      status: 'INVALID_TRANSITION',
      error: { code: e.code, message: e.message },
    };
  }
  // Fall-through — surface the message but no internals.
  const message = err instanceof Error ? err.message : 'Unknown error';
  return {
    appointmentId,
    status: 'ERROR',
    error: { code: 'INTERNAL_ERROR', message },
  };
}

/**
 * Map a bulk-edit `failed[]` entry (which carries a string code, not a typed
 * error class) to the bulk-action result envelope. Used by
 * `BulkAssignInspectorUseCase` which delegates to `BulkEditAppointmentsUseCase`.
 */
const BULK_EDIT_CODE_TO_STATUS: Record<string, BulkActionResultStatus> = {
  APPOINTMENT_NOT_FOUND: 'NOT_FOUND',
  APPOINTMENT_UPDATE_NOT_ALLOWED: 'INVALID_TRANSITION',
  INSPECTOR_INACTIVE: 'FORBIDDEN',
  INSPECTOR_NOT_ELIGIBLE: 'FORBIDDEN',
};

export function mapBulkEditFailureToResult(failed: { id: string; code: string; message: string }): BulkActionResultItem {
  return {
    appointmentId: failed.id,
    status: BULK_EDIT_CODE_TO_STATUS[failed.code] ?? 'ERROR',
    error: { code: failed.code, message: failed.message },
  };
}
