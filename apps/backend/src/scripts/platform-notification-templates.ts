// Platform-default notification templates (tenant_id = NULL), seeded by
// seed-platform-notification-templates.ts. Kept as a plain data module so unit
// tests can assert the seed catalog without touching the database.

export interface PlatformTemplateSeed {
  code: string;
  channel: 'EMAIL' | 'SMS';
  subject: string | null;
  body: string;
  /** Defaults to OPERATIONAL (schema default) when omitted. */
  notificationClass?: 'TRANSACTIONAL' | 'OPERATIONAL' | 'MARKETING';
}

export const PLATFORM_TEMPLATES: PlatformTemplateSeed[] = [
  // ── EMAIL templates ────────────────────────────────────────────────────────
  {
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Upcoming Property Inspection',
    body: `Dear {{rentalTenantName}}, an inspection has been scheduled for {{propertyAddress}} on {{scheduledDate}} between {{timeSlot}}. Confirm or reschedule: {{confirmationLink}}.`,
  },
  {
    code: 'REMINDER_7_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 7 Days',
    body: `Dear {{rentalTenantName}}, this is a reminder that your property inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.`,
  },
  {
    code: 'REMINDER_5_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 5 Days',
    body: `Dear {{rentalTenantName}}, your property inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.`,
  },
  {
    code: 'REMINDER_3_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 3 Days',
    body: `Dear {{rentalTenantName}}, your property inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.`,
  },
  {
    code: 'PROPERTY_MANAGER_ESCALATION',
    channel: 'EMAIL',
    subject: 'Tenant Not Responding - Escalation',
    body: `The tenant {{rentalTenantName}} at {{propertyAddress}} has not responded to the inspection notice for {{scheduledDate}}. Please follow up.`,
  },
  {
    code: 'INSPECTION_CONFIRMED',
    channel: 'EMAIL',
    subject: 'Inspection Confirmed',
    body: 'Dear {{rentalTenantName}}, your inspection at {{propertyAddress}} on {{scheduledDate}} has been confirmed.',
  },
  {
    code: 'INSPECTION_RESCHEDULED',
    channel: 'EMAIL',
    subject: 'Inspection Rescheduled',
    body: 'Dear {{rentalTenantName}}, the inspection at {{propertyAddress}} has been rescheduled. New details will follow.',
  },
  {
    code: 'INSPECTION_CANCELLED',
    channel: 'EMAIL',
    subject: 'Inspection Cancelled',
    body: 'Dear {{rentalTenantName}}, the inspection at {{propertyAddress}} on {{scheduledDate}} has been cancelled.',
  },
  {
    code: 'INSPECTION_UNAVAILABILITY_REPORTED',
    channel: 'EMAIL',
    subject: 'Tenant Reported Unavailability',
    body: 'The tenant {{rentalTenantName}} reported that the inspection at {{propertyAddress}} on {{scheduledDate}} is unavailable. Review appointment {{appointmentCode}} for follow-up.',
  },
  {
    code: 'REPORT_READY',
    channel: 'EMAIL',
    subject: 'Your report "{{reportType}}" is ready',
    body: `Hi {{userName}}, your {{reportType}} report is ready. View and download it at {{downloadLink}}. The file is available for 30 days.`,
  },
  {
    code: 'REPORT_FAILED',
    channel: 'EMAIL',
    subject: 'Your report "{{reportType}}" failed',
    body: `Hi {{userName}}, your {{reportType}} report could not be generated. Reason: {{errorMessage}}. You can retry from the reports page: {{downloadLink}}.`,
  },
  {
    // Internal ops alert (inspection-execution.notify-not-started cron). TRANSACTIONAL so it
    // can never be consent-blocked, and no unsubscribe footer — the recipient is the ops team.
    code: 'INSPECTION_STUCK_ALERT',
    channel: 'EMAIL',
    subject: 'Inspection stuck in progress for over {{hoursStuck}} hours',
    body: 'The inspection for appointment {{appointmentId}} (inspector {{inspectorId}}) started at {{startedAt}} and has been in progress for more than {{hoursStuck}} hours without being finished. Please review the execution and follow up with the inspector.',
    notificationClass: 'TRANSACTIONAL',
  },
  // ── SMS templates ─────────────────────────────────────────────────────────
  {
    code: 'INSPECTION_NOTICE_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, inspection scheduled for {{scheduledDate}}. Confirm: {{confirmationLink}}',
  },
  {
    code: 'REMINDER_7_DAYS_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, your inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.',
  },
  {
    code: 'REMINDER_5_DAYS_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, your inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.',
  },
  {
    code: 'REMINDER_3_DAYS_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, your inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.',
  },
  {
    code: 'TENANT_SMS_ALERT',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Inspection at {{propertyAddress}} on {{scheduledDate}}. Confirm at {{confirmationLink}}',
  },
  {
    code: 'INSPECTION_CONFIRMED_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, your inspection on {{scheduledDate}} has been confirmed.',
  },
  {
    code: 'INSPECTION_RESCHEDULED_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, your inspection on {{scheduledDate}} has been rescheduled. New details will follow.',
  },
  {
    code: 'INSPECTION_CANCELLED_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, the inspection on {{scheduledDate}} has been cancelled.',
  },
  {
    code: 'INSPECTION_UNAVAILABILITY_REPORTED_SMS',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: Hi {{rentalTenantName}}, we received your unavailability report for {{scheduledDate}}. We will be in touch.',
  },
  // ── Portal link (operator-triggered, not mandatory) ──────────────────────
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'EMAIL',
    subject: 'Your property inspection portal',
    body: `Dear {{rentalTenantName}}, confirm, reschedule or update contact details for your inspection on {{scheduledDate}} using this secure link: {{confirmationLink}}.`,
  },
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: inspection on {{scheduledDate}}. Manage it here: {{confirmationLink}}',
  },
];
