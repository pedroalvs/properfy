export const CancellationReasonCode = {
  CLIENT_REQUEST: 'CLIENT_REQUEST',
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
  DUPLICATE: 'DUPLICATE',
  SCHEDULING_CONFLICT: 'SCHEDULING_CONFLICT',
  OTHER: 'OTHER',
} as const;
export type CancellationReasonCode = (typeof CancellationReasonCode)[keyof typeof CancellationReasonCode];

export const RejectionReasonCode = {
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  ACCESS_DENIED: 'ACCESS_DENIED',
  UNSAFE_PROPERTY: 'UNSAFE_PROPERTY',
  INCOMPLETE_DATA: 'INCOMPLETE_DATA',
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = (typeof RejectionReasonCode)[keyof typeof RejectionReasonCode];
