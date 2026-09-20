import type { NotificationClass } from '../enums';
import { formatCivilDate, formatWallTimeRange } from '../utils/format-display-date';

/** Path (relative to a web app base URL) at which the Properfy logo is served. */
export const PROPERFY_LOGO_PATH = '/images/properfy-logo-red.png';

/**
 * Canonical https URL of the Properfy logo used in email templates via the
 * {{properfyLogoUrl}} variable. Points at the production web app and serves as
 * the default/fallback (e.g. template previews). Live sends resolve the logo per
 * environment via {@link buildProperfyLogoUrl}.
 */
export const PROPERFY_LOGO_URL = `https://app.properfy.me${PROPERFY_LOGO_PATH}`;

/**
 * Resolves the Properfy logo URL for a given web app base URL, so an email
 * resolves its logo from the current environment's web app (dev, staging or
 * prod) instead of a hardcoded domain. Falls back to {@link PROPERFY_LOGO_URL}
 * when no base URL is provided.
 */
export function buildProperfyLogoUrl(webAppBaseUrl?: string | null): string {
  if (!webAppBaseUrl) return PROPERFY_LOGO_URL;
  return new URL(PROPERFY_LOGO_PATH, webAppBaseUrl).toString();
}

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
  // Email-only by decision. Each of these announces an action the occupant has just
  // taken themselves (or, for a cancellation, one they opted in to hear about), so an
  // SMS twin only restated the email. The dispatch legs were removed with the codes.
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
  'INSPECTION_CANCELLED_AGENCY',
  'INSPECTION_REJECTED_AGENCY',
  'INSPECTION_UNAVAILABILITY_REPORTED',
  'REPORT_READY',
  'REPORT_FAILED',
  'TENANT_PORTAL_LINK',
  'INSPECTION_SATISFACTION_SURVEY',
] as const;

export type MandatoryTemplateCode = (typeof MANDATORY_TEMPLATE_CODES)[number];

/**
 * Platform-only templates: seeded at platform level and never customizable per tenant,
 * so they are excluded from MANDATORY_TEMPLATE_CODES (which drives the tenant template UI).
 * They are still visible to AM/OP on the templates list, so they need labels and targets.
 */
export const PLATFORM_ONLY_TEMPLATE_CODES = [
  'PASSWORD_RESET',
  'INSPECTION_STUCK_ALERT',
  'INSPECTOR_GROUP_ASSIGNED',
  'INSPECTOR_GROUP_UNASSIGNED',
  'INSPECTOR_GROUP_RESCHEDULED',
  'TENANT_NOTICE_FORWARDED_AGENCY',
] as const;

export type PlatformOnlyTemplateCode = (typeof PLATFORM_ONLY_TEMPLATE_CODES)[number];

/**
 * Every template code an operator may edit through the templates UI. The
 * mandatory (tenant-facing) catalog plus the platform-only codes — the latter
 * are editable ONLY as the platform default (`tenant_id IS NULL`) and ONLY by
 * AM/OP; they have no per-agency override. `upsert-notification-template.use-case.ts`
 * enforces both rules.
 *
 * REGION_DEACTIVATED is deliberately excluded: it is dispatched with a literal
 * code and is not seeded into `notification_templates`, so no row of it ever
 * appears in the list for anyone to edit.
 */
export const EDITABLE_TEMPLATE_CODES = [
  ...MANDATORY_TEMPLATE_CODES,
  ...PLATFORM_ONLY_TEMPLATE_CODES,
] as const;

export type EditableTemplateCode = MandatoryTemplateCode | PlatformOnlyTemplateCode;

const EDITABLE_TEMPLATE_CODE_SET: ReadonlySet<string> = new Set(EDITABLE_TEMPLATE_CODES);
const PLATFORM_ONLY_TEMPLATE_CODE_SET: ReadonlySet<string> = new Set(PLATFORM_ONLY_TEMPLATE_CODES);

/** Whether a template code can be edited/saved through the templates UI. */
export function isEditableTemplateCode(templateCode: string): boolean {
  return EDITABLE_TEMPLATE_CODE_SET.has(templateCode);
}

/**
 * Whether a code is a platform-only editable template — one that has a single
 * platform default row (`tenant_id IS NULL`) and no per-agency override, so it
 * is editable by AM/OP only and never scoped to a tenant.
 */
export function isPlatformScopedEditableCode(templateCode: string): boolean {
  return PLATFORM_ONLY_TEMPLATE_CODE_SET.has(templateCode);
}

/**
 * Templates sent with the platform's "system" email identity (dedicated
 * from-address and BCC on the Resend config) rather than the inspection one.
 * These are account/operations messages — password resets, report delivery,
 * internal alerts — not occupant- or agency-facing inspection traffic.
 *
 * REGION_DEACTIVATED is dispatched with a literal code
 * (notify-inspectors-on-region-deactivation.handler.ts) and belongs to neither
 * catalog, which is why this union is wider than the two catalogs' types.
 */
export const SYSTEM_TEMPLATE_CODES = [
  'PASSWORD_RESET',
  'REPORT_READY',
  'REPORT_FAILED',
  'REGION_DEACTIVATED',
  'INSPECTION_STUCK_ALERT',
] as const satisfies readonly (
  | MandatoryTemplateCode
  | PlatformOnlyTemplateCode
  | 'REGION_DEACTIVATED'
)[];

export type SystemTemplateCode = (typeof SYSTEM_TEMPLATE_CODES)[number];

const SYSTEM_TEMPLATE_CODE_SET: ReadonlySet<string> = new Set(SYSTEM_TEMPLATE_CODES);

/** Whether a template code is sent with the system email identity. */
export function isSystemTemplate(templateCode: string): boolean {
  return SYSTEM_TEMPLATE_CODE_SET.has(templateCode);
}

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
  INSPECTION_RESCHEDULED: 'Inspection Rescheduled',
  INSPECTION_CANCELLED: 'Inspection Cancelled',
  INSPECTION_CANCELLED_AGENCY: 'Inspection Cancelled (Agency)',
  INSPECTION_REJECTED_AGENCY: 'Inspection Rejected (Agency)',
  INSPECTION_UNAVAILABILITY_REPORTED: 'Unavailability Reported',
  REPORT_READY: 'Report Ready',
  REPORT_FAILED: 'Report Failed',
  TENANT_PORTAL_LINK: 'Tenant Portal Link',
  INSPECTION_SATISFACTION_SURVEY: 'Satisfaction Survey',
};

/**
 * Labels for the platform-only codes. Kept in a separate map so TEMPLATE_CODE_LABELS stays
 * exhaustive over MANDATORY_TEMPLATE_CODES (its type is what stops a new tenant-facing
 * template from shipping unlabelled).
 */
export const PLATFORM_TEMPLATE_CODE_LABELS: Record<PlatformOnlyTemplateCode, string> = {
  PASSWORD_RESET: 'Password Reset',
  INSPECTION_STUCK_ALERT: 'Inspection Stuck Alert',
  INSPECTOR_GROUP_ASSIGNED: 'Inspector Group Assigned',
  INSPECTOR_GROUP_UNASSIGNED: 'Inspector Group Unassigned',
  INSPECTOR_GROUP_RESCHEDULED: 'Inspector Group Rescheduled',
  TENANT_NOTICE_FORWARDED_AGENCY: 'Tenant Notice Forwarded to Agency',
};

/**
 * Display label for any template code. Resolves the tenant-facing catalog first, then the
 * platform-only one, and falls back to the raw code for custom templates.
 */
export function getTemplateCodeLabel(templateCode: string): string {
  // hasOwnProperty, not bare indexing: a code like `constructor` would otherwise resolve to
  // an inherited function and get returned as the label.
  if (Object.prototype.hasOwnProperty.call(TEMPLATE_CODE_LABELS, templateCode)) {
    return TEMPLATE_CODE_LABELS[templateCode as MandatoryTemplateCode];
  }
  if (Object.prototype.hasOwnProperty.call(PLATFORM_TEMPLATE_CODE_LABELS, templateCode)) {
    return PLATFORM_TEMPLATE_CODE_LABELS[templateCode as PlatformOnlyTemplateCode];
  }
  return templateCode;
}

/**
 * Resolves a free-text search term to the set of known template codes whose raw
 * code OR human-readable label contains it (case-insensitive). The templates
 * list filters on the raw `template_code`, but the UI shows the humanized label,
 * so a search for "Inspection Notice" must still reach `INSPECTION_NOTICE`.
 * Returns an empty array for a blank term.
 */
export function matchTemplateCodesBySearch(term: string): string[] {
  const query = term.trim().toLowerCase();
  if (!query) return [];
  // Every listable template code is an editable one, so reuse that single catalog
  // rather than re-concatenating the two source arrays.
  return (EDITABLE_TEMPLATE_CODES as readonly string[]).filter(
    (code) =>
      code.toLowerCase().includes(query) || getTemplateCodeLabel(code).toLowerCase().includes(query),
  );
}

// ---------------------------------------------------------------------------
// Targets — who receives each notification
// ---------------------------------------------------------------------------

export const NOTIFICATION_TARGETS = [
  'RENTAL_TENANT',
  'PROPERTY_MANAGER',
  'INSPECTOR',
  'USER_ACCOUNT',
  'PLATFORM_OPS',
] as const;

export type NotificationTarget = (typeof NOTIFICATION_TARGETS)[number];

/**
 * Who actually receives each template.
 *
 * This is a declared mapping rather than a field on the template row because the recipient
 * is resolved at each dispatch site, not stored with the template. **If you add or move a
 * dispatch site, update this map.**
 *
 * **This map is load-bearing, not merely descriptive.** `SendNotificationUseCase` reads it to
 * decide whether a notification is occupant-directed and must therefore be suppressed when its
 * agency has `rentalTenantNotificationsEnabled: false`. A wrong target here either leaks a
 * message to a rental tenant whose agency blocked contact, or silently withholds one from an
 * agency, inspector or user account that should always receive it.
 *
 * Current sources, one per family:
 *
 * - RENTAL_TENANT — `notify-on-status-transition.handler.ts` (email + SMS for the notice,
 *   email only for a cancellation), `notify-on-rental-tenant-portal-action.handler.ts` and
 *   `notify-on-admin-reschedule.handler.ts` (both email-only — the occupant-action SMS
 *   twins were retired), `dispatch-reminders.use-case.ts` (email + SMS),
 *   `dispatch-escalations.use-case.ts` (TENANT_SMS_ALERT),
 *   `generate-portal-token.use-case.ts` (TENANT_PORTAL_LINK)
 * - PROPERTY_MANAGER — `dispatch-escalations.use-case.ts` and
 *   `notify-on-status-transition.handler.ts` (INSPECTION_CANCELLED_AGENCY, the agency's own
 *   copy of a cancellation, and INSPECTION_REJECTED_AGENCY, its cue to reschedule a
 *   rejected appointment), plus `send-notification.use-case.ts`
 *   (TENANT_NOTICE_FORWARDED_AGENCY, the mirror of a suppressed occupant message), all via
 *   `branch.contactEmail`
 * - INSPECTOR — `notify-on-group-inspector-change.subscriber.ts`, via `inspector.email`
 * - USER_ACCOUNT — `process-report-job.use-case.ts` (the requesting user),
 *   `request-password-reset.use-case.ts`
 * - PLATFORM_OPS — `notify-stuck.worker.ts`, hardcoded internal ops inbox
 *
 * Typed over the full code union on purpose: a new template code cannot be added to either
 * catalog without declaring its target here.
 */
export const TEMPLATE_TARGETS: Record<
  MandatoryTemplateCode | PlatformOnlyTemplateCode,
  NotificationTarget
> = {
  INSPECTION_NOTICE: 'RENTAL_TENANT',
  INSPECTION_NOTICE_SMS: 'RENTAL_TENANT',
  REMINDER_7_DAYS: 'RENTAL_TENANT',
  REMINDER_5_DAYS: 'RENTAL_TENANT',
  REMINDER_3_DAYS: 'RENTAL_TENANT',
  REMINDER_7_DAYS_SMS: 'RENTAL_TENANT',
  REMINDER_5_DAYS_SMS: 'RENTAL_TENANT',
  REMINDER_3_DAYS_SMS: 'RENTAL_TENANT',
  PROPERTY_MANAGER_ESCALATION: 'PROPERTY_MANAGER',
  TENANT_SMS_ALERT: 'RENTAL_TENANT',
  INSPECTION_CONFIRMED: 'RENTAL_TENANT',
  INSPECTION_RESCHEDULED: 'RENTAL_TENANT',
  INSPECTION_CANCELLED: 'RENTAL_TENANT',
  INSPECTION_CANCELLED_AGENCY: 'PROPERTY_MANAGER',
  INSPECTION_REJECTED_AGENCY: 'PROPERTY_MANAGER',
  INSPECTION_UNAVAILABILITY_REPORTED: 'RENTAL_TENANT',
  REPORT_READY: 'USER_ACCOUNT',
  REPORT_FAILED: 'USER_ACCOUNT',
  TENANT_PORTAL_LINK: 'RENTAL_TENANT',
  INSPECTION_SATISFACTION_SURVEY: 'RENTAL_TENANT',
  PASSWORD_RESET: 'USER_ACCOUNT',
  INSPECTION_STUCK_ALERT: 'PLATFORM_OPS',
  INSPECTOR_GROUP_ASSIGNED: 'INSPECTOR',
  INSPECTOR_GROUP_UNASSIGNED: 'INSPECTOR',
  INSPECTOR_GROUP_RESCHEDULED: 'INSPECTOR',
  // Must stay PROPERTY_MANAGER: this is the mirror sent when an occupant-directed
  // message is suppressed, so a RENTAL_TENANT target here would suppress the mirror
  // too and forward it again, forever.
  TENANT_NOTICE_FORWARDED_AGENCY: 'PROPERTY_MANAGER',
};

/** Target for any template code; `undefined` for custom codes outside both catalogs. */
export function getTemplateTarget(templateCode: string): NotificationTarget | undefined {
  // See getTemplateCodeLabel: bare indexing would return an inherited member for a code
  // like `constructor`, and the chip would then look up a style that does not exist.
  return Object.prototype.hasOwnProperty.call(TEMPLATE_TARGETS, templateCode)
    ? TEMPLATE_TARGETS[templateCode as keyof typeof TEMPLATE_TARGETS]
    : undefined;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Template codes whose `notificationClass` is immutable and MUST remain TRANSACTIONAL —
 * recipients must always receive them regardless of any opt-out. Two families:
 *
 * - Appointment-action templates (FR-005): the occupant/agency actions a recipient
 *   must always be told about.
 * - System / inspector must-deliver templates: password resets, internal ops alerts and
 *   inspector schedule-change mail. These are seeded TRANSACTIONAL and are now editable
 *   through the templates UI, so they MUST be protected here — otherwise an upsert that
 *   omits (or changes) notificationClass would resolve to OPERATIONAL via getDefaultClass
 *   and silently make a password reset consent-suppressible. `getProtectedClass` returning
 *   a value here both pins the seed default and rejects any reclassification in upsert.
 */
export const PROTECTED_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_CONFIRMED: 'TRANSACTIONAL',
  INSPECTION_RESCHEDULED: 'TRANSACTIONAL',
  INSPECTION_CANCELLED: 'TRANSACTIONAL',
  INSPECTION_CANCELLED_AGENCY: 'TRANSACTIONAL',
  INSPECTION_REJECTED_AGENCY: 'TRANSACTIONAL',
  INSPECTION_UNAVAILABILITY_REPORTED: 'TRANSACTIONAL',
  // The mirror of a message withheld from the occupant. OPERATIONAL would make it
  // consent-checked per recipient, so a branch contact's opt-out would suppress it —
  // and then neither the occupant nor the agency ever learns of the inspection, which
  // is precisely the hole this forward exists to close.
  TENANT_NOTICE_FORWARDED_AGENCY: 'TRANSACTIONAL',
  // System / inspector must-deliver codes — seeded TRANSACTIONAL, now editable, so pinned
  // here to keep them consent-bypassed (matches platform-notification-templates.ts).
  PASSWORD_RESET: 'TRANSACTIONAL',
  INSPECTION_STUCK_ALERT: 'TRANSACTIONAL',
  INSPECTOR_GROUP_ASSIGNED: 'TRANSACTIONAL',
  INSPECTOR_GROUP_UNASSIGNED: 'TRANSACTIONAL',
  INSPECTOR_GROUP_RESCHEDULED: 'TRANSACTIONAL',
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
  // Deliberately OPERATIONAL rather than protected/TRANSACTIONAL: a feedback
  // request is not an appointment action the recipient must receive regardless
  // of opt-out, so it stays consent-checked.
  INSPECTION_SATISFACTION_SURVEY: 'OPERATIONAL',
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

/**
 * The variables each editable template may use, split into `required` (the editor
 * blocks a save that omits them) and `optional`. Keyed over every editable code —
 * the mandatory catalog plus the platform-only codes, all of which are now editable
 * through the UI.
 *
 * **Two distinct consumers, and the difference is load-bearing:**
 *
 * 1. `build-notification-payload.service.ts` (appointment-centric codes only) filters
 *    the outgoing payload down to `required + optional` and throws
 *    `MissingRequiredVariableError` when a required key is absent. So for those codes a
 *    `required` entry can drop a live send — never mark a variable required unless the
 *    appointment builder always produces it. Widening `optional` is safe: the builder
 *    computes the full appointment var set with `?? ''` fallbacks, and bodies guard
 *    empties with `{{#if}}`.
 * 2. The platform-only codes (INSPECTION_STUCK_ALERT, INSPECTOR_GROUP_*,
 *    TENANT_NOTICE_FORWARDED_AGENCY) build their payloads by hand at the dispatch site
 *    and NEVER pass through the builder. Their spec here therefore drives ONLY the editor
 *    variable toolbar, its save validation and the test-send preview — it cannot change
 *    what those notifications actually send. Their variables (e.g. `{{groupCode}}`,
 *    `{{hoursStuck}}`) are the exact placeholders their seeded bodies use, and are all in
 *    ALLOWED_VARIABLES / SAMPLE_DATA so the preview can substitute them.
 */
export const TEMPLATE_VARIABLES: Record<EditableTemplateCode, TemplateVariableSpec> = {
  INSPECTION_NOTICE: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'appointmentCode', 'confirmationLink', 'rescheduleLink', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  // SMS specs list every appointment var the builder computes EXCEPT the logo URLs
  // (no images in SMS). `rescheduleLink === confirmationLink` in the builder, so it
  // is always populated. `required` stays minimal — a required key the builder omits
  // throws MissingRequiredVariableError and loses the send.
  INSPECTION_NOTICE_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    // `timeSlot` is load-bearing beyond the copy: the status-transition dedupe
    // compares scheduledDate + timeSlot against the LATEST row of the
    // announcement family, and dual-channel writes the SMS leg last. A key
    // absent from the stored payload is skipped in that comparison, so dropping
    // timeSlot here would silently suppress a slot-only re-announcement.
    // Pinned by "email and SMS legs agree on the dedupe comparison keys" in
    // notify-on-status-transition.handler.test.ts.
    optional: ['propertyAddress', 'confirmationLink', 'rescheduleLink', 'appointmentCode', 'timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName'],
  },
  REMINDER_7_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'inspectorName', 'branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_5_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'inspectorName', 'branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_3_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'inspectorName', 'branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_7_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_5_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_3_DAYS_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'confirmationLink'],
  },
  PROPERTY_MANAGER_ESCALATION: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  // `rentalTenantName` is optional here, not required: a spec is keyed by code while
  // the SMS and EMAIL variants of a code carry different copy, and neither shipped SMS
  // body greets the tenant by name (160-character budget). Requiring it made the editor
  // refuse to save these two templates with "Missing required variables". The variable
  // is still computed and sent — `required` in this map only governs whether
  // BuildNotificationPayloadService throws when the value is absent from the payload.
  TENANT_SMS_ALERT: {
    required: ['propertyAddress', 'scheduledDate'],
    optional: ['rentalTenantName', 'confirmationLink', 'appointmentCode', 'timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName'],
  },
  INSPECTION_CONFIRMED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'rescheduleLink'],
  },
  INSPECTION_RESCHEDULED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'rescheduleLink'],
  },
  INSPECTION_CANCELLED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'rescheduleLink'],
  },
  // Agency-facing counterpart of INSPECTION_CANCELLED, addressed to the branch
  // contact rather than the rental tenant. `cancellationReason` is deliberately
  // OPTIONAL even though the state machine requires a reason for every
  // cancellation: BuildNotificationPayloadService throws
  // MissingRequiredVariableError on a missing required variable, and a template
  // that can throw would lose the agency notice entirely on an edge-case
  // cancellation. Absent reason simply renders no reason line.
  INSPECTION_CANCELLED_AGENCY: {
    required: ['propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['rentalTenantName', 'timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'properfyLogoUrl', 'agencyLogoUrl', 'cancellationReason', 'rescheduleLink'],
  },
  // Agency-facing notice that an appointment was rejected and needs rescheduling.
  // `rejectionReason` is OPTIONAL for the same reason `cancellationReason` is above:
  // a required variable that resolves to nothing would throw
  // MissingRequiredVariableError and lose the notice entirely.
  INSPECTION_REJECTED_AGENCY: {
    required: ['propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['rentalTenantName', 'timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'properfyLogoUrl', 'agencyLogoUrl', 'rejectionReason', 'rescheduleLink'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'rescheduleLink'],
  },
  REPORT_READY: {
    required: ['userName', 'reportType', 'downloadLink'],
    // Injected by the send path into every email's system/appointment layout.
    optional: ['properfyLogoUrl'],
  },
  REPORT_FAILED: {
    required: ['userName', 'reportType', 'errorMessage', 'downloadLink'],
    // Injected by the send path into every email's system/appointment layout.
    optional: ['properfyLogoUrl'],
  },
  // Same reason as TENANT_SMS_ALERT: the SMS variant of this code does not greet by
  // name, so `rentalTenantName` cannot be required of every channel's body.
  TENANT_PORTAL_LINK: {
    required: ['scheduledDate', 'confirmationLink'],
    optional: ['rentalTenantName', 'rescheduleLink', 'propertyAddress', 'timeSlot', 'inspectorName', 'branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  INSPECTION_SATISFACTION_SURVEY: {
    // Only the link is required. `BuildNotificationPayloadService` throws
    // MissingRequiredVariableError on a missing required key and loses the send
    // outright, so anything the copy can survive without stays optional.
    required: ['surveyLink'],
    optional: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'rescheduleLink'],
  },
  PASSWORD_RESET: {
    required: ['userName', 'resetLink'],
    // properfyLogoUrl is rendered by the system email layout the seed body wraps, so it
    // must be allowed or the editor would reject saving the shipped body unchanged.
    optional: ['properfyLogoUrl'],
  },
  // ── Platform-only editable codes ───────────────────────────────────────────
  // These build their payloads by hand at the dispatch site and never pass through
  // BuildNotificationPayloadService, so `required` here only gates the editor (it can
  // never drop a live send) and the vars below are exactly the placeholders the seeded
  // bodies use. `required` is left empty on purpose — an operator editing an internal
  // ops or inspector email must be free to reshape the copy. `properfyLogoUrl` comes
  // from the shared email layout (no agency branding on these), so it stays allowed.
  INSPECTION_STUCK_ALERT: {
    required: [],
    optional: ['appointmentId', 'inspectorId', 'startedAt', 'hoursStuck', 'properfyLogoUrl'],
  },
  INSPECTOR_GROUP_ASSIGNED: {
    required: [],
    optional: ['inspectorName', 'groupCode', 'scheduledDate', 'timeWindow', 'jobCount', 'properfyLogoUrl'],
  },
  INSPECTOR_GROUP_UNASSIGNED: {
    required: [],
    optional: ['inspectorName', 'groupCode', 'scheduledDate', 'timeWindow', 'jobCount', 'properfyLogoUrl'],
  },
  INSPECTOR_GROUP_RESCHEDULED: {
    required: [],
    optional: ['inspectorName', 'groupCode', 'scheduledDate', 'timeWindow', 'jobCount', 'previousScheduledDate', 'previousTimeWindow', 'properfyLogoUrl'],
  },
  // The agency-forward mirror reuses the suppressed occupant payload (appointment vars)
  // plus the suppressed-notice context keys, all assembled in SendNotificationUseCase.
  TENANT_NOTICE_FORWARDED_AGENCY: {
    required: [],
    optional: ['suppressedTemplateLabel', 'suppressedChannel', 'rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot', 'appointmentCode', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'confirmationLink', 'properfyLogoUrl', 'agencyLogoUrl'],
  },
};

// ---------------------------------------------------------------------------
// Flat variable list (union of all required + optional across all templates)
// ---------------------------------------------------------------------------

export const ALLOWED_VARIABLES = [
  'surveyLink',
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
  'properfyLogoUrl',
  'agencyLogoUrl',
  'serviceTypeName',
  'cancellationReason',
  'rejectionReason',
  'userName',
  'reportType',
  'downloadLink',
  'errorMessage',
  'resetLink',
  // Platform-only editable codes (inspector-group, stuck alert, agency forward).
  // These are hand-built at their dispatch sites, not by BuildNotificationPayloadService.
  'groupCode',
  'timeWindow',
  'jobCount',
  'previousScheduledDate',
  'previousTimeWindow',
  'hoursStuck',
  'startedAt',
  'appointmentId',
  'inspectorId',
  'suppressedTemplateLabel',
  'suppressedChannel',
] as const;

export type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

/**
 * Placeholder values the template editor substitutes to render its live preview.
 *
 * The temporal entries are produced by the same formatters that build the real
 * outgoing payload (`buildNotificationPayload` calls `formatCivilDate` and
 * `formatWallTimeRange`) rather than written out by hand. An operator tunes the
 * wording against this preview and ships it, so a preview showing a shape the
 * send never produces is worse than no preview. Deriving them means the two can
 * not drift apart the next time the display format moves.
 */
export const SAMPLE_DATA: Record<AllowedVariable, string> = {
  rentalTenantName: 'John Smith',
  propertyAddress: '123 Main St, Sydney NSW 2000',
  scheduledDate: formatCivilDate('2026-04-15'),
  timeSlot: formatWallTimeRange('09:00', '12:00'),
  inspectorName: 'Jane Doe',
  surveyLink: 'https://app.properfy.me/portal/abc123',
  confirmationLink: 'https://app.properfy.me/portal/abc123',
  rescheduleLink: 'https://app.properfy.me/portal/abc123',
  agencyName: 'ABC Realty',
  agencyPhone: '+61 2 9876 5432',
  appointmentCode: 'INS-0042',
  branchName: 'Sydney CBD Branch',
  properfyLogoUrl: PROPERFY_LOGO_URL,
  // Empty on purpose: when no agency logo can be resolved (no tenant context, or
  // an agency without an upload) the preview and test-send render nothing —
  // mirroring the real send — instead of substituting the Properfy platform logo
  // into the agency-logo slot. The real value comes from tenants.settings_json.logoUrl.
  agencyLogoUrl: '',
  serviceTypeName: 'Routine inspection',
  cancellationReason: 'Tenant requested a different week',
  rejectionReason: 'Address could not be located',
  userName: 'Admin User',
  reportType: 'Monthly Report',
  downloadLink: 'https://app.properfy.me/reports/abc123',
  errorMessage: 'Server timeout — please retry',
  resetLink: 'https://app.properfy.me/reset-password?token=abc123',
  // Platform-only editable codes. Where the real send derives a value from a
  // formatter (the group date/window), the sample uses that same formatter so the
  // preview cannot drift; the rest mirror the exact shape the dispatch site emits.
  groupCode: 'GRP-0042',
  timeWindow: formatWallTimeRange('09:00', '12:00'),
  jobCount: '5',
  previousScheduledDate: formatCivilDate('2026-04-10'),
  previousTimeWindow: formatWallTimeRange('13:00', '16:00'),
  hoursStuck: '6',
  // notify-stuck.worker emits execution.startedAt.toISOString(), so the preview
  // shows that same ISO shape rather than a civil date the send never produces.
  startedAt: '2026-04-15T09:00:00.000Z',
  appointmentId: 'b3f1c2a4-1234-4d56-89ab-000000000000',
  inspectorId: 'e7d6c5b4-4321-4a98-87cd-000000000000',
  suppressedTemplateLabel: 'Inspection Notice',
  suppressedChannel: 'EMAIL',
};
