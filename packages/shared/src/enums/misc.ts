export const AssetKind = {
  PHOTO: 'PHOTO',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const RentalTenantPortalTokenStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type RentalTenantPortalTokenStatus = (typeof RentalTenantPortalTokenStatus)[keyof typeof RentalTenantPortalTokenStatus];

export const RentalTenantPortalAction = {
  VIEW: 'VIEW',
  CONFIRM: 'CONFIRM',
  RESCHEDULE: 'RESCHEDULE',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  UNAVAILABLE_REPORTED: 'UNAVAILABLE_REPORTED',
  GROUP_JOIN: 'GROUP_JOIN',
} as const;
export type RentalTenantPortalAction = (typeof RentalTenantPortalAction)[keyof typeof RentalTenantPortalAction];

export const ReportType = {
  APPOINTMENTS: 'APPOINTMENTS',
  FINANCIAL: 'FINANCIAL',
  PERFORMANCE: 'PERFORMANCE',
  AGENCIES: 'AGENCIES',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ReportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

/**
 * Date axis for the report Period filter — selects which real appointment
 * timestamp the range applies to:
 *   SCHEDULED → appointments.scheduled_date
 *   CREATED   → appointments.created_at
 *   COMPLETED → appointments.done_checked_at
 * Financial reports ignore this axis and range on financial_entries.effective_at.
 */
export const ReportDateAxis = {
  SCHEDULED: 'SCHEDULED',
  CREATED: 'CREATED',
  COMPLETED: 'COMPLETED',
} as const;
export type ReportDateAxis = (typeof ReportDateAxis)[keyof typeof ReportDateAxis];
