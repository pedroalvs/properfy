import type { NotificationClass } from '../enums';

// ---------------------------------------------------------------------------
// Template codes
// ---------------------------------------------------------------------------

export const MANDATORY_TEMPLATE_CODES = [
  'INSPECTION_NOTICE',
  'INSPECTION_NOTICE_SMS',
  'REMINDER_7_DAYS',
  'REMINDER_5_DAYS',
  'REMINDER_3_DAYS',
  'REMINDER_7_DAYS_SMS',
  'REMINDER_5_DAYS_SMS',
  'REMINDER_3_DAYS_SMS',
  'PROPERTY_MANAGER_ESCALATION',
  'TENANT_SMS_ALERT',
  'INSPECTION_CONFIRMED',
  'INSPECTION_CONFIRMED_SMS',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_RESCHEDULED_SMS',
  'INSPECTION_CANCELLED',
  'INSPECTION_CANCELLED_SMS',
  'INSPECTION_UNAVAILABILITY_REPORTED',
  'INSPECTION_UNAVAILABILITY_REPORTED_SMS',
  'REPORT_READY',
  'REPORT_FAILED',
  'TENANT_PORTAL_LINK',
] as const;

export type MandatoryTemplateCode = (typeof MANDATORY_TEMPLATE_CODES)[number];

/**
 * Platform-only templates: seeded at platform level and never customizable per tenant,
 * so they are excluded from MANDATORY_TEMPLATE_CODES (which drives the tenant template UI).
 */
export const PLATFORM_ONLY_TEMPLATE_CODES = ['PASSWORD_RESET'] as const;

export type PlatformOnlyTemplateCode = (typeof PLATFORM_ONLY_TEMPLATE_CODES)[number];

/**
 * Human-readable labels for each mandatory template code. Single source of truth
 * for code dropdowns in the UI (e.g. the "create custom template" form).
 */
export const TEMPLATE_CODE_LABELS: Record<MandatoryTemplateCode, string> = {
  INSPECTION_NOTICE: 'Inspection Notice',
  INSPECTION_NOTICE_SMS: 'Inspection Notice (SMS)',
  REMINDER_7_DAYS: 'Reminder – 7 Days',
  REMINDER_5_DAYS: 'Reminder – 5 Days',
  REMINDER_3_DAYS: 'Reminder – 3 Days',
  REMINDER_7_DAYS_SMS: 'Reminder – 7 Days (SMS)',
  REMINDER_5_DAYS_SMS: 'Reminder – 5 Days (SMS)',
  REMINDER_3_DAYS_SMS: 'Reminder – 3 Days (SMS)',
  PROPERTY_MANAGER_ESCALATION: 'Property Manager Escalation',
  TENANT_SMS_ALERT: 'Tenant SMS Alert',
  INSPECTION_CONFIRMED: 'Inspection Confirmed',
  INSPECTION_CONFIRMED_SMS: 'Inspection Confirmed (SMS)',
  INSPECTION_RESCHEDULED: 'Inspection Rescheduled',
  INSPECTION_RESCHEDULED_SMS: 'Inspection Rescheduled (SMS)',
  INSPECTION_CANCELLED: 'Inspection Cancelled',
  INSPECTION_CANCELLED_SMS: 'Inspection Cancelled (SMS)',
  INSPECTION_UNAVAILABILITY_REPORTED: 'Unavailability Reported',
  INSPECTION_UNAVAILABILITY_REPORTED_SMS: 'Unavailability Reported (SMS)',
  REPORT_READY: 'Report Ready',
  REPORT_FAILED: 'Report Failed',
  TENANT_PORTAL_LINK: 'Tenant Portal Link',
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Template codes whose `notificationClass` is immutable and MUST remain TRANSACTIONAL.
 * Per FR-005, these are appointment-action templates — recipients must always receive them
 * regardless of any opt-out.
 */
export const PROTECTED_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_CONFIRMED: 'TRANSACTIONAL',
  INSPECTION_CONFIRMED_SMS: 'TRANSACTIONAL',
  INSPECTION_RESCHEDULED: 'TRANSACTIONAL',
  INSPECTION_RESCHEDULED_SMS: 'TRANSACTIONAL',
  INSPECTION_CANCELLED: 'TRANSACTIONAL',
  INSPECTION_CANCELLED_SMS: 'TRANSACTIONAL',
  INSPECTION_UNAVAILABILITY_REPORTED: 'TRANSACTIONAL',
  INSPECTION_UNAVAILABILITY_REPORTED_SMS: 'TRANSACTIONAL',
};

/** Protected code strings — used by UI to disable reclassification. */
export const PROTECTED_TEMPLATE_CODES = Object.keys(PROTECTED_TEMPLATE_CLASSIFICATIONS);

/** Default classification for non-protected mandatory templates (FR-006). */
export const DEFAULT_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_NOTICE: 'OPERATIONAL',
  INSPECTION_NOTICE_SMS: 'OPERATIONAL',
  REMINDER_7_DAYS: 'OPERATIONAL',
  REMINDER_5_DAYS: 'OPERATIONAL',
  REMINDER_3_DAYS: 'OPERATIONAL',
  REMINDER_7_DAYS_SMS: 'OPERATIONAL',
  REMINDER_5_DAYS_SMS: 'OPERATIONAL',
  REMINDER_3_DAYS_SMS: 'OPERATIONAL',
  PROPERTY_MANAGER_ESCALATION: 'OPERATIONAL',
  TENANT_SMS_ALERT: 'OPERATIONAL',
  REPORT_READY: 'OPERATIONAL',
  REPORT_FAILED: 'OPERATIONAL',
  TENANT_PORTAL_LINK: 'OPERATIONAL',
};

export function isProtectedTemplateCode(templateCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROTECTED_TEMPLATE_CLASSIFICATIONS, templateCode);
}

export function getProtectedClass(templateCode: string): NotificationClass | undefined {
  return PROTECTED_TEMPLATE_CLASSIFICATIONS[templateCode];
}

export function getDefaultClass(templateCode: string): NotificationClass {
  return (
    PROTECTED_TEMPLATE_CLASSIFICATIONS[templateCode] ??
    DEFAULT_TEMPLATE_CLASSIFICATIONS[templateCode] ??
    'OPERATIONAL'
  );
}

// ---------------------------------------------------------------------------
// Variable registry — single source of truth for template variables
// ---------------------------------------------------------------------------

export interface TemplateVariableSpec {
  required: readonly string[];
  optional: readonly string[];
}

export const TEMPLATE_VARIABLES: Record<
  MandatoryTemplateCode | PlatformOnlyTemplateCode,
  TemplateVariableSpec
> = {
  INSPECTION_NOTICE: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'confirmationLink', 'rescheduleLink'],
  },
  INSPECTION_NOTICE_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'confirmationLink', 'appointmentCode'],
  },
  REMINDER_7_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone'],
  },
  REMINDER_5_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone'],
  },
  REMINDER_3_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone'],
  },
  REMINDER_7_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  REMINDER_5_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  REMINDER_3_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  PROPERTY_MANAGER_ESCALATION: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['branchName', 'appointmentCode', 'agencyName'],
  },
  TENANT_SMS_ALERT: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['confirmationLink', 'appointmentCode'],
  },
  INSPECTION_CONFIRMED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode'],
  },
  INSPECTION_CONFIRMED_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  INSPECTION_RESCHEDULED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode'],
  },
  INSPECTION_RESCHEDULED_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  INSPECTION_CANCELLED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['agencyName', 'agencyPhone', 'appointmentCode'],
  },
  INSPECTION_CANCELLED_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'appointmentCode'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['agencyName'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'appointmentCode'],
  },
  REPORT_READY: {
    required: ['userName', 'reportType', 'downloadLink'],
    optional: [],
  },
  REPORT_FAILED: {
    required: ['userName', 'reportType', 'errorMessage', 'downloadLink'],
    optional: [],
  },
  TENANT_PORTAL_LINK: {
    required: ['rentalTenantName', 'scheduledDate', 'confirmationLink'],
    optional: ['rescheduleLink'],
  },
  PASSWORD_RESET: {
    required: ['userName', 'resetLink'],
    optional: [],
  },
};

// ---------------------------------------------------------------------------
// Flat variable list (union of all required + optional across all templates)
// ---------------------------------------------------------------------------

export const ALLOWED_VARIABLES = [
  'rentalTenantName',
  'propertyAddress',
  'scheduledDate',
  'timeSlot',
  'inspectorName',
  'agencyName',
  'agencyPhone',
  'appointmentCode',
  'confirmationLink',
  'rescheduleLink',
  'branchName',
  'userName',
  'reportType',
  'downloadLink',
  'errorMessage',
  'resetLink',
] as const;

export type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

export const SAMPLE_DATA: Record<AllowedVariable, string> = {
  rentalTenantName: 'John Smith',
  propertyAddress: '123 Main St, Sydney NSW 2000',
  scheduledDate: '2026-04-15',
  timeSlot: '09:00 - 12:00',
  inspectorName: 'Jane Doe',
  confirmationLink: 'https://app.properfy.com/portal/abc123',
  rescheduleLink: 'https://app.properfy.com/portal/abc123/reschedule',
  agencyName: 'ABC Realty',
  agencyPhone: '+61 2 9876 5432',
  appointmentCode: 'INS-0042',
  branchName: 'Sydney CBD Branch',
  userName: 'Admin User',
  reportType: 'Monthly Report',
  downloadLink: 'https://app.properfy.com/reports/abc123',
  errorMessage: 'Server timeout — please retry',
  resetLink: 'https://app.properfy.com/reset-password?token=abc123',
};
