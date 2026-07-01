import type { ReportColumn } from './xlsx-generator';
import type { ReportType, ReportDateAxis } from '@properfy/shared';

/** Maximum Period span per report type, in months. */
export const MAX_DATE_RANGE_MONTHS: Record<ReportType, number> = {
  APPOINTMENTS: 12,
  FINANCIAL: 12,
  PERFORMANCE: 12,
  AGENCIES: 12,
};

/** Maximum concurrent (PENDING/PROCESSING) reports a single user may have queued. */
export const MAX_CONCURRENT_REPORTS = 3;
export const REPORT_FILE_RETENTION_DAYS = 30;
export const PRESIGNED_URL_TTL_SECONDS = 3600;

/**
 * The real appointment column each date axis ranges on. Recorded so a generated
 * report can declare which domain field its Period was applied to.
 */
export const REPORT_DATE_AXIS_FIELD: Record<ReportDateAxis, 'scheduled_date' | 'created_at' | 'done_checked_at'> = {
  SCHEDULED: 'scheduled_date',
  CREATED: 'created_at',
  COMPLETED: 'done_checked_at',
};

export const APPOINTMENTS_COLUMNS: ReportColumn[] = [
  { key: 'appointmentNumber', label: 'Appointment #', width: 14 },
  { key: 'agency', label: 'Agency', width: 25 },
  { key: 'branch', label: 'Branch', width: 25 },
  { key: 'serviceType', label: 'Service Type', width: 25 },
  { key: 'propertyAddress', label: 'Property Address', width: 40 },
  { key: 'suburb', label: 'Suburb', width: 20 },
  { key: 'postcode', label: 'Postcode', width: 10 },
  { key: 'state', label: 'State', width: 15 },
  { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
  { key: 'timeSlot', label: 'Time Slot', width: 15 },
  { key: 'status', label: 'Status', width: 15 },
  { key: 'rentalTenant', label: 'Rental Tenant', width: 25 },
  { key: 'email', label: 'Email', width: 30 },
  { key: 'phone', label: 'Phone', width: 20 },
  { key: 'inspector', label: 'Inspector', width: 25 },
  { key: 'confirmationStatus', label: 'Confirmation Status', width: 20 },
  { key: 'keyRequired', label: 'Key Required', width: 12 },
  { key: 'createdAt', label: 'Created At', width: 20 },
];

export const FINANCIAL_COLUMNS: ReportColumn[] = [
  { key: 'entryDate', label: 'Entry Date', width: 15 },
  { key: 'agency', label: 'Agency', width: 25 },
  { key: 'entryType', label: 'Entry Type', width: 20 },
  { key: 'appointmentNumber', label: 'Appointment #', width: 14 },
  { key: 'inspector', label: 'Inspector', width: 25 },
  { key: 'description', label: 'Description', width: 40 },
  { key: 'revenue', label: 'Revenue', width: 14 },
  { key: 'expense', label: 'Expense', width: 14 },
  { key: 'currency', label: 'Currency', width: 10 },
];

export const PERFORMANCE_COLUMNS: ReportColumn[] = [
  { key: 'inspectorName', label: 'Inspector', width: 25 },
  { key: 'inspectorEmail', label: 'Email', width: 30 },
  { key: 'totalAppointments', label: 'Total Appointments', width: 18 },
  { key: 'completed', label: 'Completed', width: 12 },
  { key: 'cancelled', label: 'Cancelled', width: 12 },
  { key: 'rejected', label: 'Rejected', width: 12 },
  { key: 'completionRate', label: 'Completion Rate %', width: 18 },
  { key: 'avgDurationMin', label: 'Avg Duration (min)', width: 18 },
];

export const AGENCIES_COLUMNS: ReportColumn[] = [
  { key: 'agency', label: 'Agency', width: 30 },
  { key: 'totalAppointments', label: 'Total Appointments', width: 18 },
  { key: 'completed', label: 'Completed', width: 12 },
  { key: 'cancelled', label: 'Cancelled', width: 12 },
  { key: 'scheduled', label: 'Scheduled', width: 12 },
  { key: 'activeBranches', label: 'Active Branches', width: 16 },
  { key: 'activeProperties', label: 'Active Properties', width: 16 },
];

export const REPORT_COLUMNS: Record<ReportType, ReportColumn[]> = {
  APPOINTMENTS: APPOINTMENTS_COLUMNS,
  FINANCIAL: FINANCIAL_COLUMNS,
  PERFORMANCE: PERFORMANCE_COLUMNS,
  AGENCIES: AGENCIES_COLUMNS,
};
