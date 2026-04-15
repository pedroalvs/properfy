import type { NotificationClass } from '@properfy/shared';

export const MANDATORY_TEMPLATE_CODES = [
  'INSPECTION_NOTICE',
  'REMINDER_7_DAYS',
  'REMINDER_5_DAYS',
  'REMINDER_3_DAYS',
  'REMINDER_7_DAYS_SMS',
  'REMINDER_5_DAYS_SMS',
  'REMINDER_3_DAYS_SMS',
  'PROPERTY_MANAGER_ESCALATION',
  'TENANT_SMS_ALERT',
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
  'INSPECTION_UNAVAILABILITY_REPORTED',
  'REPORT_READY',
  'REPORT_FAILED',
] as const;

export type MandatoryTemplateCode = (typeof MANDATORY_TEMPLATE_CODES)[number];

/**
 * Feature 018: template codes whose `notificationClass` is immutable and MUST remain TRANSACTIONAL.
 * Any attempt to reclassify one of these templates via upsert is rejected with
 * `ProtectedTemplateClassificationError`.
 *
 * Per FR-005, these are the appointment-action templates directly tied to a scheduled
 * inspection: recipients must always receive them regardless of any opt-out.
 */
export const PROTECTED_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_CONFIRMED: 'TRANSACTIONAL',
  INSPECTION_RESCHEDULED: 'TRANSACTIONAL',
  INSPECTION_CANCELLED: 'TRANSACTIONAL',
  INSPECTION_UNAVAILABILITY_REPORTED: 'TRANSACTIONAL',
};

/**
 * Feature 018: default classification for non-protected mandatory templates (FR-006).
 * Reminders and escalations default to OPERATIONAL (subject to opt-out).
 * Operators may reclassify these via the upsert endpoint.
 */
export const DEFAULT_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_NOTICE: 'OPERATIONAL',
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

// Retry delays in milliseconds: 15s, 45s, 2min, 5min, 15min
export const RETRY_DELAYS = [15_000, 45_000, 120_000, 300_000, 900_000] as const;

export const MAX_RETRY_COUNT = 6;

export const JITTER_FACTOR = 0.1; // +/-10%
