export const CancellationReasonCode = {
  CLIENT_REQUEST: 'CLIENT_REQUEST',
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
  SCHEDULING_CONFLICT: 'SCHEDULING_CONFLICT',
  INSPECTOR_UNAVAILABLE: 'INSPECTOR_UNAVAILABLE',
  DUPLICATE: 'DUPLICATE',
  OTHER: 'OTHER',
} as const;
export type CancellationReasonCode = (typeof CancellationReasonCode)[keyof typeof CancellationReasonCode];

export const RejectionReasonCode = {
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  PROPERTY_INACCESSIBLE: 'PROPERTY_INACCESSIBLE',
  SAFETY_CONCERN: 'SAFETY_CONCERN',
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFO',
  SERVICE_NOT_AVAILABLE: 'SERVICE_NOT_AVAILABLE',
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = (typeof RejectionReasonCode)[keyof typeof RejectionReasonCode];
