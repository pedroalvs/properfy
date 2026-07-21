import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, UserRole, UserStatus, FinancialEntryType, FinancialEntryStatus, RentalTenantConfirmationStatus, ReportType, ReportStatus, GeocodingStatus, ServiceTypeFlowType, ServiceTypeStatus, AvailabilitySlotStatus, ContactType, type InspectorInvoiceStatus } from '@properfy/shared';

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

export const CONTACT_TYPE_MAP: Record<ContactType, StatusStyle> = {
  [ContactType.RENTAL_TENANT]:           { bg: 'var(--color-type-residential)', text: 'var(--color-text-primary)', label: 'Tenant' },
  [ContactType.PROPERTY_MANAGER]: { bg: 'var(--color-type-commercial)',  text: 'var(--color-text-primary)', label: 'Property Manager' },
  [ContactType.HOUSEKEEPER]:      { bg: 'var(--color-type-rural)',       text: 'var(--color-text-primary)', label: 'Housekeeper' },
  [ContactType.BROKER]:           { bg: 'var(--color-type-industrial)',  text: 'var(--color-text-primary)', label: 'Broker' },
  [ContactType.OTHER]:            { bg: 'var(--color-status-draft)',     text: 'var(--color-text-primary)', label: 'Other' },
};

export const PROPERTY_TYPE_MAP: Record<PropertyType, StatusStyle> = {
  [PropertyType.APARTMENT]:  { bg: 'var(--color-type-residential)', text: 'var(--color-text-primary)', label: 'Apartment' },
  [PropertyType.HOUSE]:      { bg: 'var(--color-type-residential)', text: 'var(--color-text-primary)', label: 'House' },
};

export const INSPECTOR_STATUS_MAP: Record<InspectorStatus, StatusStyle> = {
  [InspectorStatus.ACTIVE]:   { bg: 'var(--color-inspector-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  [InspectorStatus.INACTIVE]: { bg: 'var(--color-inspector-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
};

export const SERVICE_GROUP_STATUS_MAP: Record<ServiceGroupStatus, StatusStyle> = {
  [ServiceGroupStatus.DRAFT]:     { bg: 'var(--color-sg-draft)',     text: 'var(--color-text-primary)', label: 'Draft' },
  [ServiceGroupStatus.PUBLISHED]: { bg: 'var(--color-sg-published)', text: 'var(--color-text-primary)', label: 'Awaiting Inspector' },
  [ServiceGroupStatus.ACCEPTED]:  { bg: 'var(--color-sg-accepted)',  text: 'var(--color-text-primary)', label: 'Accepted' },
  [ServiceGroupStatus.CANCELLED]: { bg: 'var(--color-sg-cancelled)', text: 'var(--color-text-primary)', label: 'Canceled' },
  [ServiceGroupStatus.REJECTED]:  { bg: 'var(--color-sg-cancelled)', text: 'var(--color-text-primary)', label: 'Rejected' },
};

export const USER_ROLE_MAP: Record<UserRole, StatusStyle> = {
  [UserRole.AM]:       { bg: 'var(--color-role-am)',       text: 'var(--color-text-primary)', label: 'Admin Master' },
  [UserRole.OP]:       { bg: 'var(--color-role-op)',       text: 'var(--color-text-primary)', label: 'Operator' },
  [UserRole.CL_ADMIN]: { bg: 'var(--color-role-cl-admin)', text: 'var(--color-text-primary)', label: 'Real Estate' },
  [UserRole.CL_USER]:  { bg: 'var(--color-role-cl-user)',  text: 'var(--color-text-primary)', label: 'Real Estate Operator' },
  [UserRole.INSP]:     { bg: 'var(--color-role-insp)',     text: 'var(--color-text-primary)', label: 'Inspector' },
  [UserRole.TNT]:      { bg: 'var(--color-role-tnt)',      text: 'var(--color-text-primary)', label: 'Tenant' },
  [UserRole.SYS]:      { bg: 'var(--color-role-sys)',      text: 'var(--color-text-primary)', label: 'System' },
};

export const USER_STATUS_MAP: Record<UserStatus, StatusStyle> = {
  [UserStatus.ACTIVE]:         { bg: 'var(--color-user-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  [UserStatus.INACTIVE]:       { bg: 'var(--color-user-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
  [UserStatus.LOCKED]:         { bg: 'var(--color-user-locked)',   text: 'var(--color-text-primary)', label: 'Blocked' },
  [UserStatus.PENDING_INVITE]: { bg: 'var(--color-status-draft)',  text: 'var(--color-text-primary)', label: 'Pending Invite' },
};

export const FINANCIAL_ENTRY_TYPE_MAP: Record<FinancialEntryType, StatusStyle> = {
  [FinancialEntryType.TENANT_DEBIT]:      { bg: 'var(--color-fin-type-debit)',      text: 'var(--color-text-primary)', label: 'Agency Debit' },
  [FinancialEntryType.INSPECTOR_PAYOUT]:  { bg: 'var(--color-fin-type-payout)',     text: 'var(--color-text-primary)', label: 'Inspector Payout' },
  [FinancialEntryType.REFUND]:            { bg: 'var(--color-fin-type-refund)',     text: 'var(--color-text-primary)', label: 'Refund' },
  [FinancialEntryType.MANUAL_ADJUSTMENT]: { bg: 'var(--color-fin-type-adjustment)', text: 'var(--color-text-primary)', label: 'Manual Adjustment' },
};

export const FINANCIAL_ENTRY_STATUS_MAP: Record<FinancialEntryStatus, StatusStyle> = {
  [FinancialEntryStatus.PENDING]:   { bg: 'var(--color-fin-status-pending)',   text: 'var(--color-text-primary)', label: 'Pending' },
  [FinancialEntryStatus.APPROVED]:  { bg: 'var(--color-fin-status-approved)',  text: 'var(--color-text-primary)', label: 'Approved' },
  [FinancialEntryStatus.CANCELLED]: { bg: 'var(--color-fin-status-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelled' },
  [FinancialEntryStatus.VOIDED]:    { bg: 'var(--color-status-rejected)',      text: 'var(--color-text-primary)', label: 'Voided' },
};

export const RENTAL_TENANT_CONFIRMATION_STATUS_MAP: Record<RentalTenantConfirmationStatus, StatusStyle> = {
  [RentalTenantConfirmationStatus.PENDING]:     { bg: 'var(--color-confirmation-pending)',     text: 'var(--color-text-primary)', label: 'Pending' },
  [RentalTenantConfirmationStatus.CONFIRMED]:   { bg: 'var(--color-confirmation-confirmed)',   text: 'var(--color-text-primary)', label: 'Confirmed' },
  [RentalTenantConfirmationStatus.UNAVAILABLE]: { bg: 'var(--color-confirmation-unavailable)', text: 'var(--color-text-primary)', label: 'Unavailable' },
  [RentalTenantConfirmationStatus.NO_RESPONSE]: { bg: 'var(--color-confirmation-no-response)', text: 'var(--color-text-primary)', label: 'No Response' },
};

export const GEOCODING_STATUS_MAP: Record<GeocodingStatus, StatusStyle> = {
  [GeocodingStatus.PENDING]:  { bg: 'var(--color-geocoding-pending)',  text: 'var(--color-text-primary)', label: 'Pending' },
  [GeocodingStatus.SUCCESS]:  { bg: 'var(--color-geocoding-success)',  text: 'var(--color-text-primary)', label: 'Success' },
  [GeocodingStatus.FAILED]:   { bg: 'var(--color-geocoding-failed)',   text: 'var(--color-text-primary)', label: 'Failed' },
  [GeocodingStatus.MANUAL]:   { bg: 'var(--color-geocoding-manual)',   text: 'var(--color-text-primary)', label: 'Manual' },
};

export const FLOW_TYPE_MAP: Record<ServiceTypeFlowType, StatusStyle> = {
  [ServiceTypeFlowType.ROUTINE]:  { bg: 'var(--color-flow-routine)',  text: 'var(--color-text-primary)', label: 'Routine' },
  [ServiceTypeFlowType.INGOING]:  { bg: 'var(--color-flow-ingoing)',  text: 'var(--color-text-primary)', label: 'Ingoing' },
  [ServiceTypeFlowType.OUTGOING]: { bg: 'var(--color-flow-outgoing)', text: 'var(--color-text-primary)', label: 'Outgoing' },
};

export const SERVICE_TYPE_STATUS_MAP: Record<ServiceTypeStatus, StatusStyle> = {
  [ServiceTypeStatus.ACTIVE]:   { bg: 'var(--color-st-status-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  [ServiceTypeStatus.INACTIVE]: { bg: 'var(--color-st-status-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
};

export type InvoiceStatus = InspectorInvoiceStatus;

export const INVOICE_STATUS_MAP: Record<InvoiceStatus, StatusStyle> = {
  PENDING_REVIEW: { bg: 'var(--color-invoice-pending-review)', text: 'var(--color-text-primary)', label: 'Pending Review' },
  CLOSED:     { bg: 'var(--color-invoice-sent)', text: 'var(--color-text-primary)', label: 'Closed' },
  PAID:       { bg: 'var(--color-status-done)', text: 'var(--color-text-primary)', label: 'Paid' },
  VOID:       { bg: 'var(--color-status-cancelled)', text: 'var(--color-text-primary)', label: 'Rejected' },
};

export const TENANT_ADMIN_STATUS_MAP: Record<string, StatusStyle> = {
  ACTIVE:   { bg: 'var(--color-user-active)',   text: 'var(--color-text-primary)', label: 'Active' },
  INACTIVE: { bg: 'var(--color-user-inactive)', text: 'var(--color-text-primary)', label: 'Inactive' },
  PENDING:  { bg: 'var(--color-status-draft)',   text: 'var(--color-text-primary)', label: 'Pending' },
};

export const REPORT_TYPE_MAP: Record<ReportType, StatusStyle> = {
  [ReportType.APPOINTMENTS]: { bg: 'var(--color-report-type-appointments)', text: 'var(--color-text-primary)', label: 'Appointments' },
  [ReportType.FINANCIAL]:    { bg: 'var(--color-report-type-financial)',    text: 'var(--color-text-primary)', label: 'Financial' },
  [ReportType.PERFORMANCE]:  { bg: 'var(--color-report-type-performance)',  text: 'var(--color-text-primary)', label: 'Performance' },
  [ReportType.AGENCIES]:     { bg: 'var(--color-report-type-agencies)',     text: 'var(--color-text-primary)', label: 'Agencies' },
};

export const REPORT_STATUS_MAP: Record<ReportStatus, StatusStyle> = {
  [ReportStatus.PENDING]:    { bg: 'var(--color-report-status-pending)',    text: 'var(--color-text-primary)', label: 'Pending' },
  [ReportStatus.PROCESSING]: { bg: 'var(--color-report-status-processing)', text: 'var(--color-text-primary)', label: 'Processing' },
  [ReportStatus.READY]:      { bg: 'var(--color-report-status-ready)',      text: 'var(--color-text-primary)', label: 'Ready' },
  [ReportStatus.FAILED]:     { bg: 'var(--color-report-status-failed)',     text: 'var(--color-text-primary)', label: 'Failed' },
};

export const SLOT_STATUS_MAP: Record<AvailabilitySlotStatus, StatusStyle> = {
  [AvailabilitySlotStatus.AVAILABLE]: { bg: 'var(--color-slot-available)', text: 'var(--color-text-primary)', label: 'Available' },
  [AvailabilitySlotStatus.BOOKED]:    { bg: 'var(--color-slot-booked)',    text: 'var(--color-text-primary)', label: 'Booked' },
  [AvailabilitySlotStatus.CANCELLED]: { bg: 'var(--color-slot-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelled' },
};

/**
 * Notification dispatch status (per-row in the appointment notifications
 * tab). Mirrors the full `NotificationStatus` enum from
 * `@properfy/shared/enums/notification`:
 *   - PENDING:          queued / in flight.
 *   - SENT:             handed off to provider.
 *   - DELIVERED:        provider acked end-to-end.
 *   - FAILED:           provider rejected or transport error.
 *   - SKIPPED:          dispatch deliberately suppressed (rule, quiet hours,
 *                       missing recipient channel).
 *   - SKIPPED_OPT_OUT:  deliberately not sent (recipient opted out of this class,
 *                       or the agency has email sending disabled).
 * Reuses existing status-color tokens to stay aligned with the rest of
 * the design system; the two SKIPPED states share the "cancelled"
 * palette so they read as terminal-non-failure at a glance.
 */
export const NOTIFICATION_STATUS_MAP: Record<string, StatusStyle> = {
  PENDING:         { bg: 'var(--color-status-draft)',     text: 'var(--color-text-primary)', label: 'Pending' },
  SENT:            { bg: 'var(--color-status-scheduled)', text: 'var(--color-text-primary)', label: 'Sent' },
  DELIVERED:       { bg: 'var(--color-status-done)',      text: 'var(--color-text-primary)', label: 'Delivered' },
  FAILED:          { bg: 'var(--color-status-rejected)',  text: 'var(--color-text-primary)', label: 'Failed' },
  SKIPPED:         { bg: 'var(--color-status-cancelled)', text: 'var(--color-text-primary)', label: 'Skipped' },
  SKIPPED_OPT_OUT: { bg: 'var(--color-status-cancelled)', text: 'var(--color-text-primary)', label: 'Skipped (opt-out)' },
};
