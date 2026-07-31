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
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = (typeof RejectionReasonCode)[keyof typeof RejectionReasonCode];
