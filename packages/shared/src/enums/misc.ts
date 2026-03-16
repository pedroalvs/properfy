export const RestrictionSource = {
  TENANT: 'TENANT',
  CLIENT: 'CLIENT',
  OPERATOR: 'OPERATOR',
} as const;
export type RestrictionSource = (typeof RestrictionSource)[keyof typeof RestrictionSource];

export const AssetKind = {
  PHOTO: 'PHOTO',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const TenantPortalTokenStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
} as const;
export type TenantPortalTokenStatus = (typeof TenantPortalTokenStatus)[keyof typeof TenantPortalTokenStatus];

export const ReportType = {
  APPOINTMENTS: 'APPOINTMENTS',
  FINANCIAL: 'FINANCIAL',
  INSPECTORS: 'INSPECTORS',
  TENANTS: 'TENANTS',
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
