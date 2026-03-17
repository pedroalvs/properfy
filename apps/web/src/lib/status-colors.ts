import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, PriorityMode, UserRole, UserStatus, FinancialEntryType, FinancialEntryStatus, TenantConfirmationStatus, ReportType, ReportStatus, GeocodingStatus } from '@properfy/shared';

export interface StatusStyle {
  bg: string;
  text: string;
  label: string;
}

export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.DRAFT]: {
    bg: 'var(--color-status-draft)',
    text: 'var(--color-text-primary)',
    label: 'Draft',
  },
  [AppointmentStatus.AWAITING_INSPECTOR]: {
    bg: 'var(--color-status-awaiting-inspector)',
    text: 'var(--color-text-primary)',
    label: 'Awaiting Inspector',
  },
  [AppointmentStatus.SCHEDULED]: {
    bg: 'var(--color-status-scheduled)',
    text: 'var(--color-text-primary)',
    label: 'Scheduled',
  },
  [AppointmentStatus.DONE]: {
    bg: 'var(--color-status-done)',
    text: 'var(--color-text-primary)',
    label: 'Done',
  },
  [AppointmentStatus.CANCELLED]: {
    bg: 'var(--color-status-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Cancelled',
  },
  [AppointmentStatus.REJECTED]: {
    bg: 'var(--color-status-rejected)',
    text: 'var(--color-text-primary)',
    label: 'Rejected',
  },
};

export function getStatusStyle(status: AppointmentStatus): StatusStyle {
  return APPOINTMENT_STATUS_MAP[status];
}

export const PROPERTY_TYPE_MAP: Record<PropertyType, StatusStyle> = {
  [PropertyType.RESIDENTIAL]: { bg: 'var(--color-type-residential)', text: 'var(--color-text-primary)', label: 'Residential' },
  [PropertyType.COMMERCIAL]:  { bg: 'var(--color-type-commercial)',  text: 'var(--color-text-primary)', label: 'Commercial' },
  [PropertyType.INDUSTRIAL]:  { bg: 'var(--color-type-industrial)',  text: 'var(--color-text-primary)', label: 'Industrial' },
  [PropertyType.RURAL]:       { bg: 'var(--color-type-rural)',       text: 'var(--color-text-primary)', label: 'Rural' },
};

export const INSPECTOR_STATUS_MAP: Record<InspectorStatus, StatusStyle> = {
  [InspectorStatus.ACTIVE]:   { bg: 'var(--color-inspector-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  [InspectorStatus.INACTIVE]: { bg: 'var(--color-inspector-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
};

export const SERVICE_GROUP_STATUS_MAP: Record<ServiceGroupStatus, StatusStyle> = {
  [ServiceGroupStatus.DRAFT]:     { bg: 'var(--color-sg-draft)',     text: 'var(--color-text-primary)', label: 'Draft' },
  [ServiceGroupStatus.PUBLISHED]: { bg: 'var(--color-sg-published)', text: 'var(--color-text-primary)', label: 'Published' },
  [ServiceGroupStatus.ACCEPTED]:  { bg: 'var(--color-sg-accepted)',  text: 'var(--color-text-primary)', label: 'Accepted' },
  [ServiceGroupStatus.CANCELLED]: { bg: 'var(--color-sg-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelled' },
};

export const PRIORITY_MODE_MAP: Record<PriorityMode, StatusStyle> = {
  [PriorityMode.STANDARD]:     { bg: 'var(--color-priority-standard)', text: 'var(--color-text-primary)', label: 'Standard' },
  [PriorityMode.PRIORITY_24H]: { bg: 'var(--color-priority-24h)',      text: 'var(--color-text-primary)', label: '24h Priority' },
};

export const USER_ROLE_MAP: Record<UserRole, StatusStyle> = {
  [UserRole.AM]:       { bg: 'var(--color-role-am)',       text: 'var(--color-text-primary)', label: 'Admin Master' },
  [UserRole.OP]:       { bg: 'var(--color-role-op)',       text: 'var(--color-text-primary)', label: 'Operator' },
  [UserRole.CL_ADMIN]: { bg: 'var(--color-role-cl-admin)', text: 'var(--color-text-primary)', label: 'Client Admin' },
  [UserRole.CL_USER]:  { bg: 'var(--color-role-cl-user)',  text: 'var(--color-text-primary)', label: 'Client User' },
  [UserRole.INSP]:     { bg: 'var(--color-role-insp)',     text: 'var(--color-text-primary)', label: 'Inspector' },
  [UserRole.TNT]:      { bg: 'var(--color-role-tnt)',      text: 'var(--color-text-primary)', label: 'Tenant' },
};

export const USER_STATUS_MAP: Record<UserStatus, StatusStyle> = {
  [UserStatus.ACTIVE]:   { bg: 'var(--color-user-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  [UserStatus.INACTIVE]: { bg: 'var(--color-user-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
  [UserStatus.LOCKED]:   { bg: 'var(--color-user-locked)',   text: 'var(--color-text-primary)', label: 'Blocked' },
};

export const FINANCIAL_ENTRY_TYPE_MAP: Record<FinancialEntryType, StatusStyle> = {
  [FinancialEntryType.TENANT_DEBIT]:      { bg: 'var(--color-fin-type-debit)',      text: 'var(--color-text-primary)', label: 'Tenant Debit' },
  [FinancialEntryType.INSPECTOR_PAYOUT]:  { bg: 'var(--color-fin-type-payout)',     text: 'var(--color-text-primary)', label: 'Inspector Payout' },
  [FinancialEntryType.REFUND]:            { bg: 'var(--color-fin-type-refund)',     text: 'var(--color-text-primary)', label: 'Refund' },
  [FinancialEntryType.MANUAL_ADJUSTMENT]: { bg: 'var(--color-fin-type-adjustment)', text: 'var(--color-text-primary)', label: 'Manual Adjustment' },
};

export const FINANCIAL_ENTRY_STATUS_MAP: Record<FinancialEntryStatus, StatusStyle> = {
  [FinancialEntryStatus.PENDING]:   { bg: 'var(--color-fin-status-pending)',   text: 'var(--color-text-primary)', label: 'Pending' },
  [FinancialEntryStatus.APPROVED]:  { bg: 'var(--color-fin-status-approved)',  text: 'var(--color-text-primary)', label: 'Approved' },
  [FinancialEntryStatus.CANCELLED]: { bg: 'var(--color-fin-status-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelled' },
};

export const TENANT_CONFIRMATION_STATUS_MAP: Record<TenantConfirmationStatus, StatusStyle> = {
  [TenantConfirmationStatus.PENDING]:     { bg: 'var(--color-confirmation-pending)',     text: 'var(--color-text-primary)', label: 'Pending' },
  [TenantConfirmationStatus.CONFIRMED]:   { bg: 'var(--color-confirmation-confirmed)',   text: 'var(--color-text-primary)', label: 'Confirmed' },
  [TenantConfirmationStatus.UNAVAILABLE]: { bg: 'var(--color-confirmation-unavailable)', text: 'var(--color-text-primary)', label: 'Unavailable' },
  [TenantConfirmationStatus.NO_RESPONSE]: { bg: 'var(--color-confirmation-no-response)', text: 'var(--color-text-primary)', label: 'No Response' },
};

export const GEOCODING_STATUS_MAP: Record<GeocodingStatus, StatusStyle> = {
  [GeocodingStatus.PENDING]:  { bg: 'var(--color-geocoding-pending)',  text: 'var(--color-text-primary)', label: 'Pending' },
  [GeocodingStatus.SUCCESS]:  { bg: 'var(--color-geocoding-success)',  text: 'var(--color-text-primary)', label: 'Success' },
  [GeocodingStatus.FAILED]:   { bg: 'var(--color-geocoding-failed)',   text: 'var(--color-text-primary)', label: 'Failed' },
  [GeocodingStatus.MANUAL]:   { bg: 'var(--color-geocoding-manual)',   text: 'var(--color-text-primary)', label: 'Manual' },
};

export const REPORT_TYPE_MAP: Record<ReportType, StatusStyle> = {
  [ReportType.INSPECTIONS_SCHEDULED]: { bg: 'var(--color-report-type-scheduled)',    text: 'var(--color-text-primary)', label: 'Scheduled Inspections' },
  [ReportType.INSPECTIONS_DONE]:      { bg: 'var(--color-report-type-done)',         text: 'var(--color-text-primary)', label: 'Completed Inspections' },
  [ReportType.INSPECTIONS_CANCELLED]: { bg: 'var(--color-report-type-cancelled)',    text: 'var(--color-text-primary)', label: 'Cancelled Inspections' },
  [ReportType.INSPECTIONS_REJECTED]:  { bg: 'var(--color-report-type-rejected)',     text: 'var(--color-text-primary)', label: 'Rejected Inspections' },
  [ReportType.INSPECTOR_PERFORMANCE]: { bg: 'var(--color-report-type-performance)',  text: 'var(--color-text-primary)', label: 'Inspector Performance' },
  [ReportType.CONFIRMATION_STATUS]:   { bg: 'var(--color-report-type-confirmation)', text: 'var(--color-text-primary)', label: 'Confirmation Status' },
  [ReportType.FINANCIAL_SERVICES]:    { bg: 'var(--color-report-type-financial)',    text: 'var(--color-text-primary)', label: 'Financial Services' },
};

export const REPORT_STATUS_MAP: Record<ReportStatus, StatusStyle> = {
  [ReportStatus.PENDING]:    { bg: 'var(--color-report-status-pending)',    text: 'var(--color-text-primary)', label: 'Pending' },
  [ReportStatus.PROCESSING]: { bg: 'var(--color-report-status-processing)', text: 'var(--color-text-primary)', label: 'Processing' },
  [ReportStatus.READY]:      { bg: 'var(--color-report-status-ready)',      text: 'var(--color-text-primary)', label: 'Ready' },
  [ReportStatus.FAILED]:     { bg: 'var(--color-report-status-failed)',     text: 'var(--color-text-primary)', label: 'Failed' },
};
