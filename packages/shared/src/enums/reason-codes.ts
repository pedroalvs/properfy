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
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = (typeof RejectionReasonCode)[keyof typeof RejectionReasonCode];

/**
 * Rejection reason codes that only the system may assign; a human actor using
 * one is refused. Drives the portal no-reoffer rule too: a tenant cannot
 * reschedule a job rejected with one of these codes.
 */
export const SYSTEM_ONLY_REJECTION_CODES: RejectionReasonCode[] = [RejectionReasonCode.INSPECTOR_UNABLE];
