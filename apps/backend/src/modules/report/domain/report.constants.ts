import type { ReportColumn } from './xlsx-generator';
import type { ReportType } from '@properfy/shared';

export const MAX_DATE_RANGE_MONTHS: Record<string, number> = {
  INSPECTIONS_SCHEDULED: 12,
  INSPECTIONS_DONE: 12,
  INSPECTIONS_CANCELLED: 12,
  INSPECTIONS_REJECTED: 12,
  INSPECTOR_PERFORMANCE: 12,
  CONFIRMATION_STATUS: 6,
  FINANCIAL_SERVICES: 12,
};

export const MAX_CONCURRENT_REPORTS = 3;
export const REPORT_FILE_RETENTION_DAYS = 30;
export const PRESIGNED_URL_TTL_SECONDS = 3600;

// Feature 019: scheduled reports constants
/** Maximum active (non-paused, non-deleted) schedules per user. */
export const MAX_SCHEDULES_PER_USER = 10;
/** Upper bound on catch-up rows inserted per worker tick to prevent runaway inserts. */
export const SCHEDULE_CATCHUP_MAX = 100;
/** Minutes to delay the next run when a tick hits the concurrent-report limit. */
export const SCHEDULE_RETRY_BACKOFF_ON_LIMIT_MINUTES = 5;
/** Number of consecutive failures that triggers automatic pause + owner notification. */
export const SCHEDULE_AUTO_PAUSE_FAILURE_THRESHOLD = 3;

export const RESTRICTED_REPORT_TYPES: ReportType[] = [
  'INSPECTOR_PERFORMANCE',
  'CONFIRMATION_STATUS',
  'FINANCIAL_SERVICES',
];

export const INSPECTION_COLUMNS: ReportColumn[] = [
  { key: 'appointmentId', label: 'Appointment ID', width: 36 },
  { key: 'serviceType', label: 'Service Type', width: 25 },
  { key: 'branch', label: 'Branch', width: 25 },
  { key: 'propertyAddress', label: 'Property Address', width: 40 },
  { key: 'suburb', label: 'Suburb', width: 20 },
  { key: 'postcode', label: 'Postcode', width: 10 },
  { key: 'state', label: 'State', width: 15 },
  { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
  { key: 'timeSlot', label: 'Time Slot', width: 15 },
  { key: 'status', label: 'Status', width: 15 },
  { key: 'tenantName', label: 'Tenant Name', width: 25 },
  { key: 'tenantEmail', label: 'Tenant Email', width: 30 },
  { key: 'tenantPhone', label: 'Tenant Phone', width: 20 },
  { key: 'inspector', label: 'Inspector', width: 25 },
  { key: 'confirmationStatus', label: 'Confirmation Status', width: 20 },
  { key: 'keyRequired', label: 'Key Required', width: 12 },
  { key: 'createdAt', label: 'Created At', width: 20 },
];

export const INSPECTOR_PERFORMANCE_COLUMNS: ReportColumn[] = [
  { key: 'inspectorName', label: 'Inspector Name', width: 25 },
  { key: 'inspectorEmail', label: 'Inspector Email', width: 30 },
  { key: 'totalScheduled', label: 'Total Scheduled', width: 15 },
  { key: 'totalDone', label: 'Total Done', width: 12 },
  { key: 'totalCancelled', label: 'Total Cancelled', width: 15 },
  { key: 'totalRejected', label: 'Total Rejected', width: 15 },
  { key: 'completionRate', label: 'Completion Rate %', width: 18 },
  { key: 'avgDurationMin', label: 'Avg Duration (min)', width: 18 },
  { key: 'period', label: 'Period', width: 25 },
];

export const CONFIRMATION_STATUS_COLUMNS: ReportColumn[] = [
  { key: 'appointmentId', label: 'Appointment ID', width: 36 },
  { key: 'serviceType', label: 'Service Type', width: 25 },
  { key: 'propertyAddress', label: 'Property Address', width: 40 },
  { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
  { key: 'tenantName', label: 'Tenant Name', width: 25 },
  { key: 'tenantPhone', label: 'Tenant Phone', width: 20 },
  { key: 'confirmationStatus', label: 'Confirmation Status', width: 20 },
  { key: 'initialNoticeSent', label: 'Initial Notice Sent', width: 20 },
  { key: 'lastReminderSent', label: 'Last Reminder Sent', width: 20 },
  { key: 'portalLastAccessed', label: 'Portal Last Accessed', width: 20 },
  { key: 'notes', label: 'Notes', width: 30 },
];

export const FINANCIAL_SERVICES_COLUMNS: ReportColumn[] = [
  { key: 'appointmentId', label: 'Appointment ID', width: 36 },
  { key: 'serviceType', label: 'Service Type', width: 25 },
  { key: 'tenant', label: 'Tenant (Agency)', width: 25 },
  { key: 'branch', label: 'Branch', width: 25 },
  { key: 'propertyAddress', label: 'Property Address', width: 40 },
  { key: 'inspector', label: 'Inspector', width: 25 },
  { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
  { key: 'doneDate', label: 'Done Date', width: 15 },
  { key: 'priceAmount', label: 'Price Amount', width: 15 },
  { key: 'payoutAmount', label: 'Payout Amount', width: 15 },
  { key: 'currency', label: 'Currency', width: 10 },
  { key: 'tenantDebitStatus', label: 'Tenant Debit Status', width: 20 },
  { key: 'inspectorPayoutStatus', label: 'Inspector Payout Status', width: 22 },
];

export const REPORT_COLUMNS: Record<string, ReportColumn[]> = {
  INSPECTIONS_SCHEDULED: INSPECTION_COLUMNS,
  INSPECTIONS_DONE: INSPECTION_COLUMNS,
  INSPECTIONS_CANCELLED: INSPECTION_COLUMNS,
  INSPECTIONS_REJECTED: INSPECTION_COLUMNS,
  INSPECTOR_PERFORMANCE: INSPECTOR_PERFORMANCE_COLUMNS,
  CONFIRMATION_STATUS: CONFIRMATION_STATUS_COLUMNS,
  FINANCIAL_SERVICES: FINANCIAL_SERVICES_COLUMNS,
};

/** Valid column keys per report type (for user-defined column selection). */
export const REPORT_COLUMN_KEYS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(REPORT_COLUMNS).map(([type, cols]) => [type, new Set(cols.map((c) => c.key))]),
);

export const DEFAULT_TENANT_MAX_CONCURRENT_REPORTS = 10;
