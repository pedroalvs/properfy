export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  AWAITING_INSPECTOR: 'AWAITING_INSPECTOR',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const TenantConfirmationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  UNAVAILABLE: 'UNAVAILABLE',
  NO_RESPONSE: 'NO_RESPONSE',
} as const;
export type TenantConfirmationStatus = (typeof TenantConfirmationStatus)[keyof typeof TenantConfirmationStatus];

export const RestrictionSource = {
  TENANT_PORTAL: 'TENANT_PORTAL',
  OPERATOR: 'OPERATOR',
  IMPORT: 'IMPORT',
} as const;
export type RestrictionSource = (typeof RestrictionSource)[keyof typeof RestrictionSource];
