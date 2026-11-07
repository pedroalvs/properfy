import type { AppointmentStatus } from './appointment';

export const CancellationReasonCode = {
  CLIENT_REQUEST: 'CLIENT_REQUEST',
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
  SCHEDULING_CONFLICT: 'SCHEDULING_CONFLICT',
  INSPECTOR_UNAVAILABLE: 'INSPECTOR_UNAVAILABLE',
  DUPLICATE: 'DUPLICATE',
  /**
   * System-assigned only: the appointment's date passed while it was still in an
   * active status. Never offered as a manual choice — see `CANCELLATION_OPTIONS`
   * in the web `StatusTransitionDialog`.
   */
  EXPIRED: 'EXPIRED',
  OTHER: 'OTHER',
} as const;
export type CancellationReasonCode = (typeof CancellationReasonCode)[keyof typeof CancellationReasonCode];

export const RejectionReasonCode = {
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  PROPERTY_INACCESSIBLE: 'PROPERTY_INACCESSIBLE',
  SAFETY_CONCERN: 'SAFETY_CONCERN',
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFO',
  SERVICE_NOT_AVAILABLE: 'SERVICE_NOT_AVAILABLE',
  TENANT_NO_RESPONSE: 'TENANT_NO_RESPONSE',
  /**
   * The rental tenant answered "No" in the portal. Kept distinct from
   * `TENANT_NO_RESPONSE` (assigned by the T-1 sweep) because the two lead to
   * different follow-ups: a decline carries the weekly availability the tenant
   * submitted, so the appointment can be rescheduled against it.
   */
  TENANT_DECLINED: 'TENANT_DECLINED',
  /**
   * System-assigned only: the inspector reported "Can't do this job" from the
   * app, which drives SCHEDULED → REJECTED as the SYSTEM actor. Never offered as
   * a manual choice — rejecting with it as a human is refused
   * (`REJECTION_REASON_CODE_SYSTEM_ONLY`). See `SYSTEM_ONLY_REJECTION_CODES`.
   */
  INSPECTOR_UNABLE: 'INSPECTOR_UNABLE',
  /**
   * Chosen by OP/AM on SCHEDULED → REJECTED when the inspector didn't attend;
   * counts against the inspector in the reliability index (F07, metrics
   * PUNCTUALITY and CANT_ATTEND). Only valid from SCHEDULED, and never by the
   * system actor — see `allowedRejectionCodesFrom` and the transition use case.
   */
  INSPECTOR_NO_SHOW: 'INSPECTOR_NO_SHOW',
  /**
   * Only on DONE → REJECTED: the inspection was marked done but not carried out;
   * the only DONE → REJECTED code that penalises the inspector (F07, metric
   * DONE_REJECTED). Any other DONE → REJECTED code removes the DONE from the
   * reliability universe instead of penalising it.
   */
  NOT_EXECUTED: 'NOT_EXECUTED',
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = (typeof RejectionReasonCode)[keyof typeof RejectionReasonCode];

/**
 * Rejection reason codes that only the system may assign; a human actor using
 * one is refused. Drives the portal no-reoffer rule too: a tenant cannot
 * reschedule a job rejected with one of these codes.
 */
export const SYSTEM_ONLY_REJECTION_CODES: RejectionReasonCode[] = [RejectionReasonCode.INSPECTOR_UNABLE];

/**
 * Rejection reason codes that are only valid from a specific source status
 * (F07-1). Every code NOT listed here is a general code, valid from any status
 * that can transition to REJECTED (the pre-F07 behaviour). The two restricted
 * codes drive the reliability index and only make sense from one status:
 * `INSPECTOR_NO_SHOW` on a still-`SCHEDULED` job, `NOT_EXECUTED` on a `DONE` one.
 */
export const REJECTION_CODES_BY_ORIGIN: Partial<Record<AppointmentStatus, RejectionReasonCode[]>> = {
  SCHEDULED: [RejectionReasonCode.INSPECTOR_NO_SHOW],
  DONE: [RejectionReasonCode.NOT_EXECUTED],
};

/** The origin-restricted codes, in one place, so the general set is "everything else". */
const ORIGIN_RESTRICTED_REJECTION_CODES: RejectionReasonCode[] = [
  RejectionReasonCode.INSPECTOR_NO_SHOW,
  RejectionReasonCode.NOT_EXECUTED,
];

/**
 * The rejection reason codes allowed when rejecting from `fromStatus`: all
 * general codes plus the origin-restricted codes for that status. This is an
 * origin-only rule — actor/role rules (who may reject, system-only codes) are
 * enforced separately in the transition use case and the RBAC matrix.
 */
export function allowedRejectionCodesFrom(fromStatus: AppointmentStatus): RejectionReasonCode[] {
  const general = Object.values(RejectionReasonCode).filter(
    (code) => !ORIGIN_RESTRICTED_REJECTION_CODES.includes(code),
  );
  return [...general, ...(REJECTION_CODES_BY_ORIGIN[fromStatus] ?? [])];
}
