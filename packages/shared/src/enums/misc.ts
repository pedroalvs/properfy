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
  INSPECTIONS_SCHEDULED: 'INSPECTIONS_SCHEDULED',
  INSPECTIONS_DONE: 'INSPECTIONS_DONE',
  INSPECTIONS_CANCELLED: 'INSPECTIONS_CANCELLED',
  INSPECTIONS_REJECTED: 'INSPECTIONS_REJECTED',
  INSPECTOR_PERFORMANCE: 'INSPECTOR_PERFORMANCE',
  CONFIRMATION_STATUS: 'CONFIRMATION_STATUS',
  FINANCIAL_SERVICES: 'FINANCIAL_SERVICES',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ReportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ReportFormat = {
  XLSX: 'XLSX',
  CSV: 'CSV',
  PDF: 'PDF',
} as const;
export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat];
