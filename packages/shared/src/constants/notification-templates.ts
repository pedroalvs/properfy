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
] as const;

export type MandatoryTemplateCode = (typeof MANDATORY_TEMPLATE_CODES)[number];

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

export const TEMPLATE_VARIABLES: Record<MandatoryTemplateCode, TemplateVariableSpec> = {
  INSPECTION_NOTICE: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'confirmationLink', 'rescheduleLink', 'unsubscribeUrl'],
  },
  INSPECTION_NOTICE_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'confirmationLink', 'appointmentCode'],
  },
  REMINDER_7_DAYS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'unsubscribeUrl'],
  },
  REMINDER_5_DAYS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'unsubscribeUrl'],
  },
  REMINDER_3_DAYS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'unsubscribeUrl'],
  },
  REMINDER_7_DAYS_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  REMINDER_5_DAYS_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  REMINDER_3_DAYS_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  PROPERTY_MANAGER_ESCALATION: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['branchName', 'appointmentCode', 'agencyName', 'unsubscribeUrl'],
  },
  TENANT_SMS_ALERT: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['confirmationLink', 'appointmentCode'],
  },
  INSPECTION_CONFIRMED: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode'],
  },
  INSPECTION_CONFIRMED_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  INSPECTION_RESCHEDULED: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'unsubscribeUrl'],
  },
  INSPECTION_RESCHEDULED_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode'],
  },
  INSPECTION_CANCELLED: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['agencyName', 'agencyPhone', 'appointmentCode'],
  },
  INSPECTION_CANCELLED_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'appointmentCode'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED: {
    required: ['tenantName', 'propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['agencyName'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED_SMS: {
    required: ['tenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'appointmentCode'],
  },
  REPORT_READY: {
    required: ['userName', 'reportType', 'downloadLink'],
    optional: ['unsubscribeUrl'],
  },
  REPORT_FAILED: {
    required: ['userName', 'reportType', 'errorMessage', 'downloadLink'],
    optional: ['unsubscribeUrl'],
  },
};

// ---------------------------------------------------------------------------
// Flat variable list (union of all required + optional across all templates)
// ---------------------------------------------------------------------------

export const ALLOWED_VARIABLES = [
  'tenantName',
  'propertyAddress',
  'scheduledDate',
  'timeSlot',
  'inspectorName',
  'agencyName',
  'agencyPhone',
  'appointmentCode',
  'confirmationLink',
  'rescheduleLink',
  'unsubscribeUrl',
  'branchName',
  'userName',
  'reportType',
  'downloadLink',
  'errorMessage',
] as const;

export type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

// ---------------------------------------------------------------------------
// Image placeholder — {{image:key}} syntax
// ---------------------------------------------------------------------------

/** Matches every {{image:key}} placeholder in a template body. */
export const IMAGE_PLACEHOLDER_REGEX = /\{\{image:(?<key>[a-zA-Z0-9_-]{1,64})\}\}/g;

/** Placeholder key validation: 1–64 chars, letters/digits/underscore/hyphen. */
export const IMAGE_PLACEHOLDER_KEY_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Returns true when the key is a valid image placeholder key.
 * Distinct from Handlebars variable names — image keys are alphanumeric + _-.
 */
export function isValidImagePlaceholderKey(key: string): boolean {
  return IMAGE_PLACEHOLDER_KEY_REGEX.test(key);
}

/**
 * Extracts all unique image placeholder keys from a template body.
 * Returns an empty array if the body contains no {{image:key}} tokens.
 */
export function extractImagePlaceholderKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const match of body.matchAll(IMAGE_PLACEHOLDER_REGEX)) {
    if (match.groups?.key) keys.add(match.groups.key);
  }
  return Array.from(keys);
}

export const SAMPLE_DATA: Record<AllowedVariable, string> = {
  tenantName: 'John Smith',
  propertyAddress: '123 Main St, Sydney NSW 2000',
  scheduledDate: '2026-04-15',
  timeSlot: '09:00 - 12:00',
  inspectorName: 'Jane Doe',
  confirmationLink: 'https://app.properfy.com/portal/abc123',
  rescheduleLink: 'https://app.properfy.com/portal/abc123/reschedule',
  agencyName: 'ABC Realty',
  agencyPhone: '+61 2 9876 5432',
  appointmentCode: 'INS-0042',
  unsubscribeUrl: 'https://app.properfy.com/notifications/unsubscribe?token=xyz',
  branchName: 'Sydney CBD Branch',
  userName: 'Admin User',
  reportType: 'Monthly Report',
  downloadLink: 'https://app.properfy.com/reports/abc123',
  errorMessage: 'Server timeout — please retry',
};
