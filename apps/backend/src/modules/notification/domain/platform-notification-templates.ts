// Platform-default notification templates (tenant_id = NULL), seeded by
// seed-platform-notification-templates.ts. Kept as a plain data module so unit
// tests can assert the seed catalog without touching the database.

import { createHash } from 'node:crypto';
import { getDefaultClass, type NotificationClass } from '@properfy/shared';
import {
  renderAppointmentEmailHtml,
  renderSystemEmailHtml,
  tenantEmailHtml,
  EMAIL_LINK_STYLE,
  EMAIL_CALLOUT_STYLE,
  SYSTEM_CTA_STYLE,
  SYSTEM_NOTE_STYLE,
} from './email-layout';

export interface PlatformTemplateSeed {
  code: string;
  channel: 'EMAIL' | 'SMS';
  subject: string | null;
  body: string;
  /**
   * Rich HTML body for EMAIL templates. When absent, the seeder falls back to
   * wrapping the plain-text body in a single <p>.
   */
  bodyHtml?: string;
  /**
   * Explicit override. Normally omitted — `resolvePlatformTemplateClass` derives
   * the class from the shared catalogue, so a code registered in
   * PROTECTED_TEMPLATE_CLASSIFICATIONS gets that class without restating it here.
   */
  notificationClass?: 'TRANSACTIONAL' | 'OPERATIONAL' | 'MARKETING';
}

/**
 * The `notification_class` a seeded platform row must carry.
 *
 * Exists because the seeder used to write the column only when an entry declared
 * it, which silently dropped every other row onto the schema default
 * (OPERATIONAL) — including codes the shared catalogue marks protected and
 * TRANSACTIONAL. `upsert-notification-template.use-case.ts` has always applied
 * `getProtectedClass`, so a row's class ended up depending on which write path
 * touched it last: templates edited through the UI were correct, templates only
 * ever seeded were not. That is how the four appointment-action SMS codes came to
 * be consent-suppressible while their email twins were not.
 *
 * `getDefaultClass` already resolves PROTECTED → DEFAULT → OPERATIONAL, so the
 * catalogue stays the single source of truth and the seeder stops having an
 * opinion of its own.
 */
export function resolvePlatformTemplateClass(entry: PlatformTemplateSeed): NotificationClass {
  return entry.notificationClass ?? getDefaultClass(entry.code);
}

export interface PlatformTemplateContent {
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
}

/**
 * The exact column values a catalog entry seeds — including the `<p>` fallback
 * for EMAIL entries without a rich body. Both the seeder and the startup sync
 * must write (and hash) through this so their notion of "seed content" agrees.
 */
export function platformTemplateEffectiveContent(entry: PlatformTemplateSeed): PlatformTemplateContent {
  return {
    subject: entry.subject,
    bodyText: entry.body,
    bodyHtml: entry.channel === 'EMAIL' ? (entry.bodyHtml ?? `<p>${entry.body}</p>`) : null,
  };
}

/**
 * Stable fingerprint of seed content, stored in
 * `notification_templates.seeded_content_hash`. A platform row is only
 * auto-refreshed from the catalog while its current content still matches the
 * hash it was seeded with — any human edit breaks the match and protects the row.
 */
export function platformTemplateContentHash(content: PlatformTemplateContent): string {
  return createHash('sha256')
    .update(`${content.subject ?? ''}\u0000${content.bodyText}\u0000${content.bodyHtml ?? ''}`)
    .digest('hex');
}

// ── Shared paragraph fragments for the appointment email layout ─────────────

const CLOSING_PARAGRAPHS =
  '<p>If you have any other concerns or questions, please contact us.</p>' +
  '<p>Thank you and Kind Regards.</p>';

const CONTACT_TEAM_SENTENCE =
  'please contact our bookings team by replying to this email' +
  '{{#if agencyPhone}} or calling <strong>{{agencyPhone}}</strong> (Monday to Friday, 9:00am to 5:00pm){{/if}}.';

const SERVICE_LABEL = '{{#if serviceTypeName}}{{serviceTypeName}}{{else}}inspection{{/if}}';

// ── Appointment EMAIL bodies (shared appointment layout) ───────────────────

const INSPECTION_NOTICE_HTML = tenantEmailHtml(
  '<p>I hope this message finds you well.</p>' +
  "<p>As part of the property manager's commitment to providing quality service to both owners and tenants, " +
  `we will be conducting the <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} of ' +
  '<strong>{{propertyAddress}}</strong>{{#if agencyName}} on behalf of <strong>{{agencyName}}</strong>{{/if}}.</p>' +
  '<p>The scheduled date for the visit is <strong>{{scheduledDate}} at {{timeSlot}}</strong>. ' +
  'If you are available during this time, kindly reply to this email or click on the link below.</p>' +
  `<p><a href="{{confirmationLink}}" target="_blank" style="${EMAIL_LINK_STYLE}">Confirm Availability</a></p>` +
  '<p><b>Important:</b></p>' +
  '<p><strong>Inspection Process</strong></p>' +
  '<p>During the inspection, photographs of each room will be taken to complete a report for your ' +
  "property manager's review. If there are any personal items you do not wish to be photographed, " +
  'we recommend storing them away prior to the inspection.</p>' +
  `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Action Required:</strong> ` +
  'Please confirm your attendance via the provided link to ensure access to the inspection.<br>' +
  '<strong>Confirmation must be completed at least 24 hours prior to the scheduled inspection.</strong></p>' +
  '<p><strong>Inspection Scheduling</strong></p>' +
  '<p>As our team manages a high volume of inspections, we are unable to provide a specific time for your appointment.</p>' +
  `<p>If you need to reschedule, please use the link provided. If no suitable dates are available, ${CONTACT_TEAM_SENTENCE}</p>` +
  '<p><strong>Please note:</strong> We do not hold keys to the property. If you are unable to attend, ' +
  'it is essential you inform us in advance.</p>' +
  "<p>If for any reason you won't be available, please let us know.</p>" +
  '<p>We highly encourage you to be present during the inspection, as it will only take approximately ' +
  '10 minutes of your time.</p>' +
  '<p>Your prompt response would be greatly appreciated.</p>' +
  CLOSING_PARAGRAPHS,
);

function reminderHtml(days: number): string {
  return tenantEmailHtml(
    `<p>This is a friendly reminder that the <strong>${SERVICE_LABEL}</strong>` +
    '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}}' +
    '{{#if propertyAddress}} of <strong>{{propertyAddress}}</strong>{{/if}} is in ' +
    `<strong>${days} days</strong>, on <strong>{{scheduledDate}}{{#if timeSlot}} at {{timeSlot}}{{/if}}</strong>.</p>` +
    '{{#if confirmationLink}}' +
    '<p>If you have not confirmed your attendance yet, please do so via the link below.</p>' +
    `<p><a href="{{confirmationLink}}" target="_blank" style="${EMAIL_LINK_STYLE}">Confirm Availability</a></p>` +
    '{{/if}}' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Please note:</strong> We do not hold keys to the property. ` +
    'If you are unable to attend, it is essential you inform us in advance.</p>' +
    `<p>If you need to reschedule, ${CONTACT_TEAM_SENTENCE}</p>` +
    CLOSING_PARAGRAPHS,
  );
}

const ESCALATION_HTML = renderAppointmentEmailHtml({
  heading: 'Action needed{{#if branchName}} — {{branchName}}{{/if}}',
  contentHtml:
    '<p>The tenant <strong>{{rentalTenantName}}</strong> at <strong>{{propertyAddress}}</strong> ' +
    `has not responded to the notice for the <strong>${SERVICE_LABEL}</strong>` +
    '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} scheduled for ' +
    '<strong>{{scheduledDate}} at {{timeSlot}}</strong>.</p>' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Action Required:</strong> ` +
    'Please follow up with the tenant to secure access to the property.</p>' +
    CLOSING_PARAGRAPHS,
});

const CONFIRMED_HTML = tenantEmailHtml(
  `<p>Thank you — your attendance for the <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} of ' +
  '<strong>{{propertyAddress}}</strong> has been <strong>confirmed</strong>.</p>' +
  '<p>The visit will take place on <strong>{{scheduledDate}} at {{timeSlot}}</strong>.</p>' +
  '<p>We highly encourage you to be present during the inspection, as it will only take approximately ' +
  '10 minutes of your time.</p>' +
  CLOSING_PARAGRAPHS,
);

const RESCHEDULED_HTML = tenantEmailHtml(
  `<p>The <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} of ' +
  '<strong>{{propertyAddress}}</strong> has been <strong>rescheduled</strong>.</p>' +
  '<p>The new visit date is <strong>{{scheduledDate}} at {{timeSlot}}</strong>.</p>' +
  `<p>If this new time does not suit you, ${CONTACT_TEAM_SENTENCE}</p>` +
  CLOSING_PARAGRAPHS,
);

const CANCELLED_HTML = tenantEmailHtml(
  `<p>The <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} of ' +
  '<strong>{{propertyAddress}}</strong> scheduled for <strong>{{scheduledDate}}</strong> ' +
  'has been <strong>cancelled</strong>.</p>' +
  '<p>No further action is required from you.</p>' +
  CLOSING_PARAGRAPHS,
);

// Agency-facing cancellation notice. Deliberately NOT built with
// tenantEmailHtml: that wrapper bakes in the "Dear {{rentalTenantName}}"
// greeting, which would address the agency by its tenant's name. Mirrors
// ESCALATION_HTML, the other agency-facing appointment email.
const CANCELLED_AGENCY_HTML = renderAppointmentEmailHtml({
  heading: 'Inspection cancelled{{#if branchName}} — {{branchName}}{{/if}}',
  contentHtml:
    `<p>The <strong>${SERVICE_LABEL}</strong> <strong>#{{appointmentCode}}</strong> of ` +
    '<strong>{{propertyAddress}}</strong> scheduled for <strong>{{scheduledDate}}</strong> ' +
    'has been <strong>cancelled</strong>' +
    '{{#if rentalTenantName}} (tenant: <strong>{{rentalTenantName}}</strong>){{/if}}.</p>' +
    '{{#if cancellationReason}}' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Reason:</strong> {{cancellationReason}}</p>` +
    '{{/if}}' +
    '<p>No inspection will take place on this date. If the service is still required, ' +
    'a new appointment needs to be raised.</p>' +
    CLOSING_PARAGRAPHS,
});

// Agency-facing rejection notice. Same reasoning as CANCELLED_AGENCY_HTML: no
// tenantEmailHtml wrapper, because its greeting would address the agency by its
// own tenant's name. Unlike a cancellation, this one asks for an action — a
// rejected appointment is expected to be rescheduled.
const REJECTED_AGENCY_HTML = renderAppointmentEmailHtml({
  heading: 'Inspection rejected{{#if branchName}} — {{branchName}}{{/if}}',
  contentHtml:
    `<p>The <strong>${SERVICE_LABEL}</strong> <strong>#{{appointmentCode}}</strong> of ` +
    '<strong>{{propertyAddress}}</strong> scheduled for <strong>{{scheduledDate}}</strong> ' +
    'has been <strong>rejected</strong>' +
    '{{#if rentalTenantName}} (tenant: <strong>{{rentalTenantName}}</strong>){{/if}}.</p>' +
    '{{#if rejectionReason}}' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Reason:</strong> {{rejectionReason}}</p>` +
    '{{/if}}' +
    '<p>This inspection will not go ahead as scheduled and needs to be rearranged. ' +
    'Where the tenant told us when they are available, those times are recorded ' +
    'against the appointment.</p>' +
    CLOSING_PARAGRAPHS,
});

// Mirror of a message the platform withheld from the rental tenant because the
// agency has `rentalTenantNotificationsEnabled: false` and handles that contact
// itself. No tenantEmailHtml wrapper, for the same reason as CANCELLED_AGENCY_HTML
// and ESCALATION_HTML: its greeting would address the agency by its own tenant's name.
//
// Deliberately generic over the suppressed event — {{suppressedTemplateLabel}} names
// it — rather than one bespoke agency variant per occupant template. Fourteen
// near-identical templates would each need registering across the shared catalogues
// and hand-written copy, for the same email volume and the same information.
const TENANT_NOTICE_FORWARDED_HTML = renderAppointmentEmailHtml({
  heading: 'Tenant notice not sent{{#if branchName}} — {{branchName}}{{/if}}',
  contentHtml:
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Action required:</strong> ` +
    'your agency is set to contact tenants directly, so Properfy did not send this ' +
    'message. Please pass it on to the tenant.</p>' +
    '<p><strong>Notice withheld:</strong> {{suppressedTemplateLabel}}' +
    '{{#if suppressedChannel}} ({{suppressedChannel}}){{/if}}</p>' +
    `<p>It concerns the <strong>${SERVICE_LABEL}</strong>` +
    '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}} of ' +
    '<strong>{{propertyAddress}}</strong> scheduled for <strong>{{scheduledDate}}</strong>' +
    '{{#if timeSlot}} at <strong>{{timeSlot}}</strong>{{/if}}' +
    '{{#if rentalTenantName}} (tenant: <strong>{{rentalTenantName}}</strong>){{/if}}.</p>' +
    '{{#if confirmationLink}}' +
    '<p>The tenant can confirm or change the booking here: {{confirmationLink}}</p>' +
    '{{/if}}' +
    CLOSING_PARAGRAPHS,
});

const UNAVAILABILITY_HTML = tenantEmailHtml(
  '<p>We have received your unavailability report for the ' +
  `<strong>${SERVICE_LABEL}</strong> <strong>#{{appointmentCode}}</strong> of ` +
  '<strong>{{propertyAddress}}</strong> scheduled for <strong>{{scheduledDate}}</strong>.</p>' +
  '<p>Our bookings team will review it and be in touch to arrange a suitable alternative.</p>' +
  CLOSING_PARAGRAPHS,
);

const PORTAL_LINK_HTML = tenantEmailHtml(
  `<p>You can confirm, reschedule or update your contact details for the <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}}' +
  '{{#if propertyAddress}} of <strong>{{propertyAddress}}</strong>{{/if}} scheduled for ' +
  '<strong>{{scheduledDate}}{{#if timeSlot}} at {{timeSlot}}{{/if}}</strong> using your secure portal link below.</p>' +
  `<p><a href="{{confirmationLink}}" target="_blank" style="${EMAIL_LINK_STYLE}">Open your inspection portal</a></p>` +
  `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Please note:</strong> this link is unique to you — do not share it.</p>` +
  CLOSING_PARAGRAPHS,
);

const SATISFACTION_SURVEY_HTML = tenantEmailHtml(
  `<p>Your <strong>${SERVICE_LABEL}</strong>` +
  '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}}' +
  '{{#if propertyAddress}} at <strong>{{propertyAddress}}</strong>{{/if}}' +
  '{{#if scheduledDate}} on <strong>{{scheduledDate}}</strong>{{/if}} has been completed' +
  '{{#if inspectorName}} by <strong>{{inspectorName}}</strong>{{/if}}.</p>' +
  '<p>Would you take a moment to tell us how it went? It only takes a few seconds.</p>' +
  `<p><a href="{{surveyLink}}" target="_blank" style="${EMAIL_LINK_STYLE}">Rate your inspection</a></p>` +
  `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Please note:</strong> your inspector only sees the rating — never your name or comments.</p>` +
  CLOSING_PARAGRAPHS,
);

// ── System EMAIL bodies (Properfy-branded light layout) ─────────────────────

const PASSWORD_RESET_HTML = renderSystemEmailHtml({
  heading: 'Reset your password',
  contentHtml:
    '<p>Hi {{userName}},</p>' +
    '<p>We received a request to reset your Properfy password. Click the button below to choose a new one.</p>' +
    `<p style="margin:24px 0;" align="center"><a href="{{resetLink}}" target="_blank" style="${SYSTEM_CTA_STYLE}">Reset password</a></p>` +
    `<p style="${SYSTEM_NOTE_STYLE}">This link expires in <strong>1 hour</strong>. ` +
    'If you did not request a password reset, you can safely ignore this email — your password will not change.</p>',
});

const REPORT_READY_HTML = renderSystemEmailHtml({
  heading: 'Your report is ready',
  contentHtml:
    '<p>Hi {{userName}},</p>' +
    '<p>Your <strong>{{reportType}}</strong> report has been generated and is ready to download.</p>' +
    `<p style="margin:24px 0;" align="center"><a href="{{downloadLink}}" target="_blank" style="${SYSTEM_CTA_STYLE}">Download report</a></p>` +
    `<p style="${SYSTEM_NOTE_STYLE}">The file is available for <strong>30 days</strong>. After that you can generate it again from the reports page.</p>`,
});

const REPORT_FAILED_HTML = renderSystemEmailHtml({
  heading: 'Report generation failed',
  contentHtml:
    '<p>Hi {{userName}},</p>' +
    '<p>Unfortunately your <strong>{{reportType}}</strong> report could not be generated.</p>' +
    `<p style="${SYSTEM_NOTE_STYLE}"><strong>Reason:</strong> {{errorMessage}}</p>` +
    `<p style="margin:24px 0;" align="center"><a href="{{downloadLink}}" target="_blank" style="${SYSTEM_CTA_STYLE}">Try again</a></p>`,
});

const STUCK_ALERT_HTML = renderSystemEmailHtml({
  heading: 'Inspection stuck in progress',
  contentHtml:
    '<p>The inspection for appointment <strong>{{appointmentId}}</strong> (inspector <strong>{{inspectorId}}</strong>) ' +
    'started at <strong>{{startedAt}}</strong> and has been in progress for more than ' +
    '<strong>{{hoursStuck}} hours</strong> without being finished.</p>' +
    `<p style="${SYSTEM_NOTE_STYLE}"><strong>Action required:</strong> review the execution and follow up with the inspector.</p>`,
});

const GROUP_JOB_DETAILS_HTML =
  '<p>Group <strong>{{groupCode}}</strong> — {{jobCount}} job(s)<br>' +
  'Date: <strong>{{scheduledDate}}</strong><br>' +
  'Time window: <strong>{{timeWindow}}</strong></p>';

const INSPECTOR_GROUP_ASSIGNED_HTML = renderSystemEmailHtml({
  heading: 'A group has been assigned to you',
  contentHtml:
    '<p>Hi {{inspectorName}}, an operator has assigned the following group to you.</p>' +
    GROUP_JOB_DETAILS_HTML +
    `<p style="${SYSTEM_NOTE_STYLE}">Open the Properfy app to see the addresses and plan your route.</p>`,
});

const INSPECTOR_GROUP_UNASSIGNED_HTML = renderSystemEmailHtml({
  heading: 'A group is no longer assigned to you',
  contentHtml:
    '<p>Hi {{inspectorName}}, an operator has reassigned the following group to another inspector.</p>' +
    GROUP_JOB_DETAILS_HTML +
    `<p style="${SYSTEM_NOTE_STYLE}"><strong>No action required</strong> — these jobs have been removed from your schedule.</p>`,
});

const INSPECTOR_GROUP_RESCHEDULED_HTML = renderSystemEmailHtml({
  heading: 'A group you accepted has been rescheduled',
  contentHtml:
    '<p>Hi {{inspectorName}}, an operator has changed the schedule of a group assigned to you.</p>' +
    '<p>Group <strong>{{groupCode}}</strong> — {{jobCount}} job(s)<br>' +
    'Was: {{previousScheduledDate}}, {{previousTimeWindow}}<br>' +
    'Now: <strong>{{scheduledDate}}</strong>, <strong>{{timeWindow}}</strong></p>' +
    `<p style="${SYSTEM_NOTE_STYLE}"><strong>Action required:</strong> check the new time fits your schedule and contact the operations team if it does not.</p>`,
});

export const PLATFORM_TEMPLATES: PlatformTemplateSeed[] = [
  // ── EMAIL templates ────────────────────────────────────────────────────────
  {
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: '{{#if serviceTypeName}}{{serviceTypeName}}{{else}}Inspection{{/if}} at {{propertyAddress}}',
    body: `Dear {{rentalTenantName}}, an inspection has been scheduled for {{propertyAddress}} on {{scheduledDate}} at {{timeSlot}}. Confirm or reschedule: {{confirmationLink}}.`,
    bodyHtml: INSPECTION_NOTICE_HTML,
  },
  {
    code: 'REMINDER_7_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 7 Days',
    body: `Dear {{rentalTenantName}}, this is a reminder that your property inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.`,
    bodyHtml: reminderHtml(7),
  },
  {
    code: 'REMINDER_5_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 5 Days',
    body: `Dear {{rentalTenantName}}, your property inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.`,
    bodyHtml: reminderHtml(5),
  },
  {
    code: 'REMINDER_3_DAYS',
    channel: 'EMAIL',
    subject: 'Inspection Reminder - 3 Days',
    body: `Dear {{rentalTenantName}}, your property inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.`,
    bodyHtml: reminderHtml(3),
  },
  {
    code: 'PROPERTY_MANAGER_ESCALATION',
    channel: 'EMAIL',
    subject: 'Tenant Not Responding - Escalation',
    body: `The tenant {{rentalTenantName}} at {{propertyAddress}} has not responded to the inspection notice for {{scheduledDate}}. Please follow up.`,
    bodyHtml: ESCALATION_HTML,
  },
  {
    code: 'INSPECTION_CONFIRMED',
    channel: 'EMAIL',
    subject: 'Inspection Confirmed',
    body: 'Dear {{rentalTenantName}}, your inspection at {{propertyAddress}} on {{scheduledDate}} has been confirmed.',
    bodyHtml: CONFIRMED_HTML,
  },
  {
    code: 'INSPECTION_RESCHEDULED',
    channel: 'EMAIL',
    subject: 'Inspection Rescheduled',
    body: 'Dear {{rentalTenantName}}, the inspection at {{propertyAddress}} has been rescheduled. New details will follow.',
    bodyHtml: RESCHEDULED_HTML,
  },
  {
    code: 'INSPECTION_CANCELLED',
    channel: 'EMAIL',
    subject: 'Inspection Cancelled',
    body: 'Dear {{rentalTenantName}}, the inspection at {{propertyAddress}} on {{scheduledDate}} has been cancelled.',
    bodyHtml: CANCELLED_HTML,
  },
  {
    code: 'INSPECTION_CANCELLED_AGENCY',
    channel: 'EMAIL',
    subject: 'Inspection Cancelled - {{propertyAddress}}',
    body: 'The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been cancelled.',
    bodyHtml: CANCELLED_AGENCY_HTML,
    // No explicit notificationClass: resolvePlatformTemplateClass derives
    // TRANSACTIONAL from PROTECTED_TEMPLATE_CLASSIFICATIONS. Restating it here
    // was the workaround for the seeder bug this file now fixes.
  },
  {
    code: 'INSPECTION_REJECTED_AGENCY',
    channel: 'EMAIL',
    subject: 'Inspection Rejected - {{propertyAddress}}',
    body: 'The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been rejected and needs to be rearranged.',
    bodyHtml: REJECTED_AGENCY_HTML,
    // Explicit for the same reason as INSPECTION_CANCELLED_AGENCY above: the
    // seeder leaves the column on the OPERATIONAL default when the entry omits
    // it, and an OPERATIONAL row is consent-checked per recipient, which would
    // let a branch contact's opt-out suppress the notice telling them to
    // reschedule. Matches PROTECTED_TEMPLATE_CLASSIFICATIONS in @properfy/shared.
    notificationClass: 'TRANSACTIONAL',
  },
  {
    code: 'TENANT_NOTICE_FORWARDED_AGENCY',
    channel: 'EMAIL',
    subject: 'Tenant notice not sent - {{propertyAddress}}',
    body: 'Your agency contacts tenants directly, so Properfy did not send "{{suppressedTemplateLabel}}" for inspection {{appointmentCode}} at {{propertyAddress}} on {{scheduledDate}}. Please pass it on to the tenant.',
    bodyHtml: TENANT_NOTICE_FORWARDED_HTML,
    // No explicit notificationClass: resolvePlatformTemplateClass derives
    // TRANSACTIONAL from PROTECTED_TEMPLATE_CLASSIFICATIONS.
  },
  {
    code: 'INSPECTION_UNAVAILABILITY_REPORTED',
    channel: 'EMAIL',
    subject: 'Tenant Reported Unavailability',
    body: 'The tenant {{rentalTenantName}} reported that the inspection at {{propertyAddress}} on {{scheduledDate}} is unavailable. Review appointment {{appointmentCode}} for follow-up.',
    bodyHtml: UNAVAILABILITY_HTML,
  },
  {
    code: 'REPORT_READY',
    channel: 'EMAIL',
    subject: 'Your report "{{reportType}}" is ready',
    body: `Hi {{userName}}, your {{reportType}} report is ready. View and download it at {{downloadLink}}. The file is available for 30 days.`,
    bodyHtml: REPORT_READY_HTML,
  },
  {
    code: 'REPORT_FAILED',
    channel: 'EMAIL',
    subject: 'Your report "{{reportType}}" failed',
    body: `Hi {{userName}}, your {{reportType}} report could not be generated. Reason: {{errorMessage}}. You can retry from the reports page: {{downloadLink}}.`,
    bodyHtml: REPORT_FAILED_HTML,
  },
  {
    // Internal ops alert (inspection-execution.notify-not-started cron). TRANSACTIONAL so it
    // can never be consent-blocked, and no unsubscribe footer — the recipient is the ops team.
    code: 'INSPECTION_STUCK_ALERT',
    channel: 'EMAIL',
    subject: 'Inspection stuck in progress for over {{hoursStuck}} hours',
    body: 'The inspection for appointment {{appointmentId}} (inspector {{inspectorId}}) started at {{startedAt}} and has been in progress for more than {{hoursStuck}} hours without being finished. Please review the execution and follow up with the inspector.',
    bodyHtml: STUCK_ALERT_HTML,
    notificationClass: 'TRANSACTIONAL',
  },
  {
    // Security email for the self-service forgot-password flow. TRANSACTIONAL so it can
    // never be consent-blocked. The resetLink already points at the right app for the
    // recipient (web app, or PWA for inspectors).
    code: 'PASSWORD_RESET',
    channel: 'EMAIL',
    subject: 'Reset your Properfy password',
    body: 'Hi {{userName}}, we received a request to reset your Properfy password. Reset it here: {{resetLink}}. This link expires in 1 hour. If you did not request this, you can safely ignore this email.',
    bodyHtml: PASSWORD_RESET_HTML,
    notificationClass: 'TRANSACTIONAL',
  },
  // Inspector-directed operational mail. TRANSACTIONAL so it can never be
  // consent-blocked, and deliberately absent from MANDATORY_TEMPLATE_CODES:
  // the recipient is a contractor, not an agency's rental tenant, so these must
  // not appear in the per-agency template customization UI.
  {
    code: 'INSPECTOR_GROUP_ASSIGNED',
    channel: 'EMAIL',
    subject: 'Group {{groupCode}} has been assigned to you',
    body: 'Hi {{inspectorName}}, an operator has assigned group {{groupCode}} ({{jobCount}} job(s)) to you, scheduled for {{scheduledDate}} at {{timeWindow}}. Open the Properfy app to see the addresses.',
    bodyHtml: INSPECTOR_GROUP_ASSIGNED_HTML,
    notificationClass: 'TRANSACTIONAL',
  },
  {
    code: 'INSPECTOR_GROUP_UNASSIGNED',
    channel: 'EMAIL',
    subject: 'Group {{groupCode}} is no longer assigned to you',
    body: 'Hi {{inspectorName}}, an operator has reassigned group {{groupCode}} ({{jobCount}} job(s)), scheduled for {{scheduledDate}} at {{timeWindow}}, to another inspector. These jobs have been removed from your schedule.',
    bodyHtml: INSPECTOR_GROUP_UNASSIGNED_HTML,
    notificationClass: 'TRANSACTIONAL',
  },
  {
    code: 'INSPECTOR_GROUP_RESCHEDULED',
    channel: 'EMAIL',
    subject: 'Group {{groupCode}} has been rescheduled',
    body: 'Hi {{inspectorName}}, an operator has rescheduled group {{groupCode}} ({{jobCount}} job(s)) from {{previousScheduledDate}} {{previousTimeWindow}} to {{scheduledDate}} {{timeWindow}}. Check the new time fits your schedule and contact the operations team if it does not.',
    bodyHtml: INSPECTOR_GROUP_RESCHEDULED_HTML,
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
  // The confirmed / rescheduled / cancelled / unavailability-reported SMS twins were
  // retired: each restated an email the occupant was already receiving, for an action
  // they had just taken themselves. Their dispatch legs went with them, and
  // `<ts>_remove_occupant_sms_templates` deletes the rows the seeder had already written.
  // ── Portal link (operator-triggered, not mandatory) ──────────────────────
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'EMAIL',
    subject: 'Your property inspection portal',
    body: `Dear {{rentalTenantName}}, confirm, reschedule or update contact details for your inspection on {{scheduledDate}} using this secure link: {{confirmationLink}}.`,
    bodyHtml: PORTAL_LINK_HTML,
  },
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'SMS',
    subject: null,
    body: 'Properfy: inspection on {{scheduledDate}}. Manage it here: {{confirmationLink}}',
  },
  // ── Satisfaction survey (fired when the inspection is marked DONE) ────────
  {
    code: 'INSPECTION_SATISFACTION_SURVEY',
    channel: 'EMAIL',
    subject: 'How did your inspection go?',
    body: `Your inspection has been completed. Tell us how it went: {{surveyLink}}`,
    bodyHtml: SATISFACTION_SURVEY_HTML,
  },
];
