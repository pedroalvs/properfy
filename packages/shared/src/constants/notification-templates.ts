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
 * Template codes whose `notificationClass` is immutable and MUST remain TRANSACTIONAL.
 * Per FR-005, these are appointment-action templates — recipients must always receive them
 * regardless of any opt-out.
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
 * Deliberately keyed on `'PASSWORD_RESET'` rather than the whole `PlatformOnlyTemplateCode`
 * union, so widening that catalog does not silently pull the other four codes in here.
 *
 * **Do not "complete" this registry for INSPECTION_STUCK_ALERT or the INSPECTOR_GROUP_*
 * codes.** An entry is not merely descriptive — it changes what gets SENT.
 * `build-notification-payload.service.ts` filters the outgoing payload down to
 * `required + optional` and throws `MissingRequiredVariableError` when a required key is
 * absent; with no entry it passes every computed variable through untouched. So a spec that
 * is anything less than exactly right would drop variables from live notifications, or fail
 * the send outright. Those codes render variables outside ALLOWED_VARIABLES
 * (INSPECTION_STUCK_ALERT uses `{{appointmentId}}` and `{{hoursStuck}}`), which is precisely
 * why writing a correct spec for them is not a mechanical exercise.
 *
 * Note this is NOT about making them editable: those templates cannot be saved from the UI
 * at all today — `useTemplateSave.validate()` falls back to the global ALLOWED_VARIABLES
 * when no spec exists, and `upsert-notification-template.use-case.ts` rejects any code
 * outside MANDATORY_TEMPLATE_CODES server-side. Adding a spec here would not fix that.
 */
export const TEMPLATE_VARIABLES: Record<
  MandatoryTemplateCode | 'PASSWORD_RESET',
  TemplateVariableSpec
> = {
  INSPECTION_NOTICE: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'confirmationLink', 'rescheduleLink', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  INSPECTION_NOTICE_SMS: {
    required: ['rentalTenantName', 'scheduledDate'],
    // `timeSlot` is load-bearing beyond the copy: the status-transition dedupe
    // compares scheduledDate + timeSlot against the LATEST row of the
    // announcement family, and dual-channel writes the SMS leg last. A key
    // absent from the stored payload is skipped in that comparison, so dropping
    // timeSlot here would silently suppress a slot-only re-announcement.
    // Pinned by "email and SMS legs agree on the dedupe comparison keys" in
    // notify-on-status-transition.handler.test.ts.
    optional: ['propertyAddress', 'confirmationLink', 'appointmentCode', 'timeSlot'],
  },
  REMINDER_7_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_5_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
  },
  REMINDER_3_DAYS: {
    required: ['rentalTenantName', 'scheduledDate'],
    optional: ['propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName', 'confirmationLink'],
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
    optional: ['branchName', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  // `rentalTenantName` is optional here, not required: a spec is keyed by code while
  // the SMS and EMAIL variants of a code carry different copy, and neither shipped SMS
  // body greets the tenant by name (160-character budget). Requiring it made the editor
  // refuse to save these two templates with "Missing required variables". The variable
  // is still computed and sent — `required` in this map only governs whether
  // BuildNotificationPayloadService throws when the value is absent from the payload.
  TENANT_SMS_ALERT: {
    required: ['propertyAddress', 'scheduledDate'],
    optional: ['rentalTenantName', 'confirmationLink', 'appointmentCode'],
  },
  INSPECTION_CONFIRMED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  INSPECTION_RESCHEDULED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
    optional: ['inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  INSPECTION_CANCELLED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate'],
    optional: ['agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
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
    optional: ['rentalTenantName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'properfyLogoUrl', 'agencyLogoUrl', 'cancellationReason'],
  },
  // Agency-facing notice that an appointment was rejected and needs rescheduling.
  // `rejectionReason` is OPTIONAL for the same reason `cancellationReason` is above:
  // a required variable that resolves to nothing would throw
  // MissingRequiredVariableError and lose the notice entirely.
  INSPECTION_REJECTED_AGENCY: {
    required: ['propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['rentalTenantName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'properfyLogoUrl', 'agencyLogoUrl', 'rejectionReason'],
  },
  INSPECTION_UNAVAILABILITY_REPORTED: {
    required: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'appointmentCode'],
    optional: ['agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
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
    optional: ['rentalTenantName', 'rescheduleLink', 'propertyAddress', 'timeSlot', 'appointmentCode', 'agencyName', 'agencyPhone', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
  },
  INSPECTION_SATISFACTION_SURVEY: {
    // Only the link is required. `BuildNotificationPayloadService` throws
    // MissingRequiredVariableError on a missing required key and loses the send
    // outright, so anything the copy can survive without stays optional.
    required: ['surveyLink'],
    optional: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot', 'inspectorName', 'agencyName', 'agencyPhone', 'appointmentCode', 'properfyLogoUrl', 'agencyLogoUrl', 'serviceTypeName'],
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
  'userName',
  'reportType',
  'downloadLink',
  'errorMessage',
  'resetLink',
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
  userName: 'Admin User',
  reportType: 'Monthly Report',
  downloadLink: 'https://app.properfy.me/reports/abc123',
  errorMessage: 'Server timeout — please retry',
  resetLink: 'https://app.properfy.me/reset-password?token=abc123',
};
