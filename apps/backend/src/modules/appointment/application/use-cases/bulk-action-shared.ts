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
  AppointmentDateInPastError,
  AppointmentTimeInPastError,
  AppointmentTenantConfirmationRequiredError,
  AppointmentInServiceGroupError,
  AppointmentTimeSlotOutsideGroupWindowError,
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
 * Replay window for the STATE-MUTATING bulk actions (status transition,
 * cancel, reschedule, assign inspector, reopen, cross-check).
 *
 * This guard exists only to absorb a repeated submit — a double-click or a
 * network retry — and it is NOT a business rule. Note it is deliberately
 * best-effort: the callers do `getWithHash` → mutate → `set`, which is
 * check-then-act, so two genuinely concurrent requests can both miss the
 * cache. Protection against actually applying an action twice does not come
 * from here (see the domain-invariant note below); making the guard atomic
 * would mean reserving the key before the mutation in `IIdempotencyService`,
 * which every bulk action shares — worth doing, but not as a side effect of
 * retuning the window.
 * A deliberate repeat must go through: moving a status away and back, or
 * correcting a reschedule made moments earlier, are legitimate operator
 * actions and replaying them costs nobody anything. Hence minutes, not a day.
 *
 * The NOTIFICATION bulk actions deliberately do NOT use this — `bulk-resend-
 * reminder` and `send-group-portal-links` stay bucketed per day via
 * `dayKeyInTz`, because a replay there means another real email/SMS to the
 * rental tenant. Keep that distinction when adding a new bulk action, and ask:
 * does replaying it cost the tenant anything? If yes, bucket it per day.
 *
 * This key is a cheap short-circuit, NOT the correctness guarantee. The
 * authoritative protection against applying an action twice lives in the
 * delegated use cases' domain invariants — the state machine rejects a
 * transition whose `from` no longer matches, and `PerformCrossCheckUseCase`
 * throws `AppointmentDoneCrossCheckAlreadyCompletedError` when
 * `doneCheckedByUserId` is already set. That is why changing the key format
 * (this commit dropped the day bucket) is safe to deploy: records written
 * under the old format simply become unreachable, the item is re-invoked, and
 * the domain rejects it into `failed[]` instead of duplicating a side effect.
 */
export const REPLAY_WINDOW_MINUTES = 3;
/** `IIdempotencyService.set` takes hours and multiplies by 60 * 60 * 1000. */
export const REPLAY_WINDOW_TTL_HOURS = REPLAY_WINDOW_MINUTES / 60;

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
    // The two classes `UpdateAppointmentUseCase` actually throws for a past
    // date/time. `AppointmentPastDateError` used to be listed here but is
    // thrown nowhere, so past-date rejections were reaching the operator as
    // INTERNAL_ERROR — the same hole this file just closed for group errors.
    || err instanceof AppointmentDateInPastError
    || err instanceof AppointmentTimeInPastError
    || err instanceof AppointmentTenantConfirmationRequiredError
    // Service-group schedule rules. These reach here via bulk-reschedule and
    // bulk-edit, both of which delegate to `UpdateAppointmentUseCase`; without
    // them the operator is shown INTERNAL_ERROR for an ordinary business rule.
    || err instanceof AppointmentInServiceGroupError
    || err instanceof AppointmentTimeSlotOutsideGroupWindowError
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
  APPOINTMENT_IN_SERVICE_GROUP: 'INVALID_TRANSITION',
  APPOINTMENT_TIME_SLOT_OUTSIDE_GROUP_WINDOW: 'INVALID_TRANSITION',
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
