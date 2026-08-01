import { randomUUID } from 'node:crypto';
import {
  toE164Au,
  isRentalTenantNotificationsEnabled,
  type NotificationClass,
} from '@properfy/shared';
import { prepareSmsBody } from '../../domain/sms-content';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { INotificationAttemptRepository } from '../../domain/notification-attempt.repository';
import type { IEmailProvider, ISmsProvider } from '../../domain/providers';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../../domain/html-to-text.service';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { NotificationEntity } from '../../domain/notification.entity';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import { NotificationAttemptEntity } from '../../domain/notification-attempt.entity';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
} from '../../domain/notification.errors';
import {
  MAX_RETRY_COUNT,
  RETRY_DELAYS,
  JITTER_FACTOR,
  SENSITIVE_PAYLOAD_KEYS,
  REDACTED_PAYLOAD_VALUE,
  AGENCY_FORWARD_TEMPLATE_CODE,
  getTemplateTarget,
  getTemplateCodeLabel,
} from '../../domain/notification.constants';
import { renderEmailBody } from '../render-email-body';
import {
  getAgencyForwardNotificationId,
  type AgencyForwardRecipientReader,
} from '../../domain/agency-forward';

/** failure_reason stamped on an occupant message withheld by the agency switch. */
const SUPPRESSED_REASON = 'AGENCY_TENANT_NOTIFICATIONS_DISABLED';

/**
 * Reason codes this pipeline sets itself. Everything else on the failure path is
 * a raw provider message — the providers interpolate response bodies verbatim
 * (mobile-message-sms.provider.ts, resend-email.provider.ts), which routinely
 * name the destination address or number.
 *
 * That must never reach audit_logs: those rows are immutable, classified
 * OPERATIONAL_CRITICAL by default, and the per-subject erasure workflow redacts
 * by registered PII field paths — it cannot find an address buried in free text,
 * so a leak there silently breaks the erasure guarantee. The raw text stays on
 * the notification row, which the audit points at via notificationId.
 */
const AUDITABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'TEMPLATE_NOT_FOUND',
  'BUDGET_EXCEEDED',
  'INVALID_RECIPIENT_PHONE',
  'EMPTY_SMS_BODY',
]);

/** Phone numbers are PII: log at most the last 4 digits. */
function maskRecipient(recipient: string): string {
  return `***${recipient.slice(-4)}`;
}

/** Collapse anything that is not one of our own codes to a PII-free constant. */
function auditableFailureReason(reason: string | null): string {
  if (reason && AUDITABLE_FAILURE_CODES.has(reason)) return reason;
  return 'PROVIDER_ERROR';
}

function calculateNextRetryAt(retryCount: number): Date {
  const delayIndex = Math.min(Math.max(retryCount - 1, 0), RETRY_DELAYS.length - 1);
  const baseDelay = RETRY_DELAYS[delayIndex] ?? RETRY_DELAYS[0]!;
  const jitter = baseDelay * JITTER_FACTOR * (2 * Math.random() - 1);
  return new Date(Date.now() + baseDelay + jitter);
}

export interface SendNotificationInput {
  notificationId: string;
}

/**
 * Minimal shape of a forwarded notification; satisfied by CreateNotificationUseCase.
 *
 * `appointmentId` is non-nullable because the forward is only reachable for
 * appointment-scoped occupant templates, and the recipient lookup needs one.
 * `payloadJson` is string-valued to match the renderer's contract — a nested object
 * would reach the template as "[object Object]".
 */
export interface ForwardNotificationInput {
  notificationId: string;
  tenantId: string | null;
  appointmentId: string;
  recipient: string;
  channel: 'EMAIL';
  templateCode: string;
  payloadJson: Record<string, string>;
}

export interface SendNotificationDeps {
  notificationRepo: INotificationRepository;
  templateRepo: INotificationTemplateRepository;
  consentRepo: INotificationConsentRepository;
  attemptRepo: INotificationAttemptRepository;
  emailProvider: IEmailProvider;
  smsProvider: ISmsProvider;
  templateRenderer: TemplateRendererService;
  logger: Logger;
  metrics: MetricsCollector;
  getTenantSettings: (tenantId: string | null) => Promise<Record<string, unknown>>;
  /**
   * Resolves the branch contact a suppressed occupant message is mirrored to.
   * Reports WHY it could not (appointment gone vs branch has no contact email) so the
   * two can be logged and acted on differently.
   *
   * Required rather than optional: an absent port would silently turn the mirror
   * into a no-op, which is exactly the failure this feature exists to prevent.
   */
  getAgencyForwardRecipient: AgencyForwardRecipientReader;
  /** Enqueues the mirrored notification. Thin port over CreateNotificationUseCase. */
  forwardNotification: (input: ForwardNotificationInput) => Promise<void>;
  /** Render-profile HTML sanitizer (defense-in-depth) */
  htmlSanitizer?: IHtmlSanitizerService;
  /** HTML → plain text derivation */
  htmlToText?: IHtmlToTextService;
  /**
   * Records terminal send failures against the appointment so they surface in
   * the Timeline tab. Optional so existing wiring (and tests) that never look
   * at the audit trail keep working.
   */
  auditService?: AuditService;
}

export class SendNotificationUseCase {
  private readonly notificationRepo: INotificationRepository;
  private readonly templateRepo: INotificationTemplateRepository;
  private readonly consentRepo: INotificationConsentRepository;
  private readonly attemptRepo: INotificationAttemptRepository;
  private readonly emailProvider: IEmailProvider;
  private readonly smsProvider: ISmsProvider;
  private readonly templateRenderer: TemplateRendererService;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly getTenantSettings: (tenantId: string | null) => Promise<Record<string, unknown>>;
  private readonly getAgencyForwardRecipient: AgencyForwardRecipientReader;
  private readonly forwardNotification: (input: ForwardNotificationInput) => Promise<void>;
  private readonly htmlSanitizer?: IHtmlSanitizerService;
  private readonly htmlToText?: IHtmlToTextService;
  private readonly auditService?: AuditService;

  constructor(deps: SendNotificationDeps) {
    this.notificationRepo = deps.notificationRepo;
    this.templateRepo = deps.templateRepo;
    this.consentRepo = deps.consentRepo;
    this.attemptRepo = deps.attemptRepo;
    this.emailProvider = deps.emailProvider;
    this.smsProvider = deps.smsProvider;
    this.templateRenderer = deps.templateRenderer;
    this.logger = deps.logger;
    this.metrics = deps.metrics;
    this.getTenantSettings = deps.getTenantSettings;
    this.getAgencyForwardRecipient = deps.getAgencyForwardRecipient;
    this.forwardNotification = deps.forwardNotification;
    this.htmlSanitizer = deps.htmlSanitizer;
    this.htmlToText = deps.htmlToText;
    this.auditService = deps.auditService;
  }

  /**
   * Record a terminal send failure against the appointment.
   *
   * entityType is 'Appointment' on purpose: the appointment Timeline tab queries
   * audit_logs by that entity, and until now nothing in the notification
   * lifecycle wrote there — a transition would be audited as healthy while the
   * tenant was never reached. Notifications with no appointment (REPORT_READY,
   * PASSWORD_RESET) have no timeline to appear in, so they are skipped.
   *
   * Deliberately excludes the recipient: audit rows are long-lived and this
   * would put an email address or phone number in them for no operational gain
   * — the channel plus the appointment is enough to act on. The same reasoning
   * collapses a raw provider message to PROVIDER_ERROR; see
   * AUDITABLE_FAILURE_CODES.
   *
   * Only terminal failures. A retryable attempt would write a row per attempt
   * and drown the timeline, and SKIPPED_OPT_OUT is a tenant's choice rather
   * than an incident (the Notifications tab still shows it).
   */
  private auditTerminalFailure(notification: NotificationEntity): void {
    if (!this.auditService || !notification.appointmentId) return;
    this.auditService.log({
      action: 'notification.send_failed',
      actorType: 'SYSTEM',
      entityType: 'Appointment',
      entityId: notification.appointmentId,
      tenantId: notification.tenantId,
      after: {
        notificationId: notification.id,
        templateCode: notification.templateCode,
        channel: notification.channel,
        failureReason: auditableFailureReason(notification.failureReason),
        retryCount: notification.retryCount,
      },
    });
  }

  /**
   * Classify a row suppressed by the agency switch for durable mirror recovery.
   *
   * Scoped to rows this pipeline suppressed itself — a consent opt-out gets no mirror, and
   * a genuinely terminal row must still raise NotificationInvalidStatusError so real
   * double-send bugs stay loud.
   *
   * The mirror's deterministic notification ID makes re-running idempotent: pg-boss can
   * redeliver a job after the mirror was already created, and its primary key remains the
   * authority instead of a JSON payload predicate.
   */
  private async classifySuppressedRerun(
    notification: NotificationEntity,
  ): Promise<'RECOVER_MIRROR' | 'ALREADY_MIRRORED' | 'NOT_RECOVERABLE'> {
    if (notification.status !== 'SKIPPED_OPT_OUT') return 'NOT_RECOVERABLE';
    // Covers both the initial reason and a previously-recorded mirror failure, so a
    // transient lookup failure gets another chance if a redelivery does occur.
    if (
      notification.failureReason !== SUPPRESSED_REASON &&
      !notification.failureReason?.startsWith('AGENCY_FORWARD_')
    ) {
      return 'NOT_RECOVERABLE';
    }
    // Keyed on THIS notification, not the appointment. A blocked appointment collects a
    // mirror per withheld message, so each source derives its own immutable mirror ID.
    const mirrorId = getAgencyForwardNotificationId(notification.id);
    const mirrored = await this.notificationRepo.findById(mirrorId);
    return mirrored ? 'ALREADY_MIRRORED' : 'RECOVER_MIRROR';
  }

  private completeAgencyForwardRecovery(notification: NotificationEntity): void {
    notification.failureReason = SUPPRESSED_REASON;
    notification.nextRetryAt = null;
    notification.updatedAt = new Date();
  }

  private recordAgencyForwardFailure(
    notification: NotificationEntity,
    failureReason: string,
  ): void {
    notification.failureReason = failureReason;
    notification.retryCount += 1;
    notification.nextRetryAt =
      notification.retryCount >= MAX_RETRY_COUNT
        ? null
        : calculateNextRetryAt(notification.retryCount);
    notification.updatedAt = new Date();
  }

  /**
   * Mirror a suppressed occupant message to the agency, so blocking contact with the
   * rental tenant never means the agency loses the information.
   *
   * Always EMAIL, even when the suppressed leg was SMS: the mirror goes to
   * `branch.contactEmail` (the same address PROPERTY_MANAGER_ESCALATION and
   * INSPECTION_CANCELLED_AGENCY use — the agency row carries no address of its own),
   * and there is no agency SMS channel.
   *
   * The original payload rides along so the agency can reproduce the message, with
   * `suppressedTemplateLabel` / `suppressedChannel` naming what was withheld, and with
   * address/code re-derived because an SMS payload carries neither.
   *
   * AGENCY_FORWARD_TEMPLATE_CODE deliberately has no TEMPLATE_VARIABLES entry, matching
   * that registry's "do not complete this map" rule — the codes in it are the ones whose
   * payloads are built by BuildNotificationPayloadService, and this one is assembled here.
   *
   * The suppression is already persisted, so a failure here cannot resurrect the occupant
   * message. The outcome is written back to the row and failures retain a recovery schedule,
   * so the Notifications tab distinguishes "withheld and mirrored" from "withheld and nobody
   * was told" while the poller keeps attempting the latter within the retry budget.
   *
   * @returns the failure reason to persist, or null when the mirror was enqueued.
   */
  private async forwardSuppressedToAgency(notification: NotificationEntity): Promise<string | null> {
    const logContext = {
      notificationId: notification.id,
      tenantId: notification.tenantId,
      appointmentId: notification.appointmentId,
      templateCode: notification.templateCode,
      channel: notification.channel,
    };

    try {
      if (!notification.tenantId) {
        this.logger.warn(logContext, 'notification.agency_forward_skipped_no_tenant');
        this.metrics.incrementAgencyForwardFailedCount();
        return 'AGENCY_FORWARD_NO_TENANT';
      }

      if (!notification.appointmentId) {
        // Every RENTAL_TENANT template is appointment-scoped, so this is unreachable
        // today; it stays as a guard because the recipient lookup needs an appointment.
        this.logger.warn(logContext, 'notification.agency_forward_skipped_no_appointment');
        this.metrics.incrementAgencyForwardFailedCount();
        return 'AGENCY_FORWARD_NO_APPOINTMENT';
      }

      const lookup = await this.getAgencyForwardRecipient(
        notification.appointmentId,
        notification.tenantId,
      );

      if (!lookup.ok) {
        // Counted on its own metric, not the shared handler-error counter: this is the
        // one failure mode where NEITHER the occupant nor the agency learns about the
        // inspection, so it has to be alertable rather than buried in generic noise.
        // `branches.contact_email` is nullable and optional at creation, so an agency
        // configured this way stays broken until someone notices.
        this.logger.warn(
          { ...logContext, reason: lookup.reason },
          'notification.agency_forward_skipped',
        );
        this.metrics.incrementAgencyForwardFailedCount();
        return `AGENCY_FORWARD_${lookup.reason}`;
      }

      const { recipient } = lookup;

      // The renderer only ever interpolates strings; drop anything else rather than
      // let it render as "[object Object]" in an email the agency has to act on.
      const original: Record<string, string> = {};
      for (const [key, value] of Object.entries(notification.payloadJson ?? {})) {
        if (typeof value === 'string') original[key] = value;
      }

      await this.forwardNotification({
        notificationId: getAgencyForwardNotificationId(notification.id),
        tenantId: notification.tenantId,
        appointmentId: notification.appointmentId,
        recipient: recipient.contactEmail,
        channel: 'EMAIL',
        templateCode: AGENCY_FORWARD_TEMPLATE_CODE,
        payloadJson: {
          ...original,
          // After the spread: the re-derived values are authoritative, since an SMS
          // payload has no address and a stale one would mislead the agency.
          propertyAddress: recipient.propertyAddress || (original['propertyAddress'] ?? ''),
          appointmentCode: recipient.appointmentCode || (original['appointmentCode'] ?? ''),
          branchName: recipient.branchName,
          suppressedTemplateLabel: getTemplateCodeLabel(notification.templateCode),
          suppressedChannel: notification.channel,
          // Operator traceability only. The deterministic notification ID, not this JSON
          // field, is the uniqueness and crash-recovery authority.
          suppressedNotificationId: notification.id,
        },
      });

      return null;
    } catch (err) {
      this.logger.error(
        { ...logContext, err },
        'notification.agency_forward_failed: occupant message stays suppressed',
      );
      this.metrics.incrementAgencyForwardFailedCount();
      return 'AGENCY_FORWARD_FAILED';
    }
  }

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeSent()) {
      // A re-run of an already-suppressed row is the recovery path for a crash between
      // persisting the suppression and inserting the mirror. Throwing here (the default)
      // would lose that mirror forever — the row is terminal, so nothing re-enqueues it,
      // and the DLQ would only ever say "invalid status", never hinting an agency was
      // left uninformed. Re-attempting is safe: forwardSuppressedToAgency is a no-op
      // once a mirror exists for this appointment.
      const rerun = await this.classifySuppressedRerun(notification);
      if (rerun === 'RECOVER_MIRROR') {
        const forwardFailure = await this.forwardSuppressedToAgency(notification);
        if (forwardFailure) {
          this.recordAgencyForwardFailure(notification, forwardFailure);
        } else {
          this.completeAgencyForwardRecovery(notification);
        }
        await this.notificationRepo.update(notification);
        return;
      }
      if (rerun === 'ALREADY_MIRRORED') {
        // Recognised benign redelivery: this message was withheld and its mirror exists,
        // so there is nothing to do. Returning cleanly keeps it out of the DLQ, where it
        // would otherwise sit as an unactionable "invalid status".
        this.logger.debug(
          { notificationId: notification.id, appointmentId: notification.appointmentId },
          'notification.suppressed_redelivery_ignored',
        );
        this.completeAgencyForwardRecovery(notification);
        await this.notificationRepo.update(notification);
        return;
      }
      throw new NotificationInvalidStatusError();
    }

    // ─── Feature 018: classification-aware consent branching ─────────────────
    //
    // The send worker must honor the notification class stamped on the notification
    // (or resolved from the template at first check for legacy rows without a class).
    //
    //   TRANSACTIONAL → always dispatch, bypass consent entirely (FR-013).
    //   OPERATIONAL   → respect the recipient's opt-out for the OPERATIONAL class (FR-012).
    //   MARKETING     → Phase 1 has no opt-in collection, so marketing is effectively blocked.
    //
    // We determine the effective class via `notification.getEffectiveClass()`, which
    // returns `notification.notificationClass ?? 'OPERATIONAL'`. Legacy rows without a
    // stamped class are treated as OPERATIONAL (the conservative default).
    //
    // If we need to read from the template (e.g., the stamp was null AND we want the most
    // up-to-date classification), we fall through to the template load below and cross-check.
    let effectiveClass: NotificationClass = notification.getEffectiveClass();

    // Load the template ONCE (it's needed for rendering anyway). If the notification
    // entity has no class stamped, promote the template's class to the effective class.
    // Otherwise the stamped class wins to honor the spec rule "template class change does
    // not retroactively affect in-flight notifications".
    let template = await this.templateRepo.findByTenantCodeChannel(
      notification.tenantId,
      notification.templateCode,
      notification.channel,
    );
    // The tenant override is only honored when active; an inactive override
    // falls through to the platform default (used as-is, regardless of its flag).
    if (!template || !template.isActive()) {
      template = await this.templateRepo.findByTenantCodeChannel(
        null,
        notification.templateCode,
        notification.channel,
      );
    }
    if (!template) {
      // Permanent failure: no tenant or platform template exists for this code/channel.
      // Throwing would leave the notification PENDING and the retry-poll self-heal would
      // re-enqueue it forever (poison-message loop), so mark it FAILED and stop here.
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = 'TEMPLATE_NOT_FOUND';
      notification.updatedAt = new Date();
      await this.notificationRepo.update(notification);
      this.auditTerminalFailure(notification);
      this.logger.error(
        {
          notificationId: notification.id,
          templateCode: notification.templateCode,
          channel: notification.channel,
        },
        'notification.template_not_found: marked FAILED, will not retry',
      );
      return;
    }
    if (notification.notificationClass === null) {
      effectiveClass = template.notificationClass;
    }

    // Per-agency occupant kill switch: some agencies contact their own rental tenants
    // and want the platform silent towards them. Scoped by TEMPLATE_TARGETS rather than
    // by channel, so BOTH email and SMS stop, while the agency's own mail (escalation,
    // cancellation copy), inspector notices and user-account mail (report-ready,
    // password reset) are untouched. Missing key = enabled.
    //
    // The agency's delivery policy is authoritative for rental-tenant notifications, so
    // evaluate it before recipient consent can return early. Only RENTAL_TENANT targets
    // read settings here, preserving the consent path for every other recipient.
    const isOccupantDirected = getTemplateTarget(notification.templateCode) === 'RENTAL_TENANT';
    let tenantSettings: Record<string, unknown> | undefined;
    if (isOccupantDirected) {
      tenantSettings = await this.getTenantSettings(notification.tenantId);
      if (!isRentalTenantNotificationsEnabled(tenantSettings)) {
        notification.status = 'SKIPPED_OPT_OUT';
        notification.failureReason = SUPPRESSED_REASON;
        notification.nextRetryAt = calculateNextRetryAt(notification.retryCount);
        notification.updatedAt = new Date();
        // Persisted BEFORE the mirror with a recovery deadline: a crash in between can never
        // let the occupant message through, and the poller will still discover the missing copy.
        await this.notificationRepo.update(notification);
        this.logger.info(
          {
            notificationId: notification.id,
            tenantId: notification.tenantId,
            channel: notification.channel,
            templateCode: notification.templateCode,
          },
          'notification.skipped_agency_tenant_notifications_disabled',
        );

        // Persist how the mirror went. Without this a suppressed row is byte-identical
        // whether the agency was told or not, so the Notifications tab reads "working as
        // configured" while an agency with a blank branch email quietly loses every notice
        // AND every mirror — the one outcome this feature exists to rule out.
        const forwardFailure = await this.forwardSuppressedToAgency(notification);
        if (forwardFailure) {
          this.recordAgencyForwardFailure(notification, forwardFailure);
        } else {
          this.completeAgencyForwardRecovery(notification);
        }
        await this.notificationRepo.update(notification);
        return;
      }
    }

    if (effectiveClass === 'TRANSACTIONAL') {
      // Bypass consent entirely for transactional notifications (FR-013).
      // This is the most important invariant of feature 018.
      this.logger.debug(
        { notificationId: notification.id, templateCode: notification.templateCode },
        'notification.consent_bypass_transactional',
      );
    } else {
      // OPERATIONAL or MARKETING — check consent
      const consent = await this.consentRepo.findByScope({
        tenantId: notification.tenantId,
        recipient: notification.recipient,
        channel: notification.channel,
        notificationClass: effectiveClass,
      });

      // MARKETING: Phase 1 has no opt-in collection, so absence of an opted-in record
      // means "blocked". OPERATIONAL: absence of a record means "opted-in" (default).
      const shouldBlock =
        (effectiveClass === 'OPERATIONAL' && consent?.isOptedOut() === true) ||
        (effectiveClass === 'MARKETING' && !(consent && consent.isOptedOut() === false));

      if (shouldBlock) {
        notification.status = 'SKIPPED_OPT_OUT';
        notification.failureReason = 'CONSENT_OPT_OUT';
        notification.updatedAt = new Date();
        await this.notificationRepo.update(notification);
        this.logger.info(
          {
            notificationId: notification.id,
            channel: notification.channel,
            notificationClass: effectiveClass,
          },
          'notification.skipped_opt_out',
        );
        return;
      }
    }

    const settings = tenantSettings ?? (await this.getTenantSettings(notification.tenantId));

    // GAP-003: Check daily budget cap
    const dailyCap = notification.channel === 'EMAIL'
      ? (typeof settings.notificationDailyCapEmail === 'number' ? settings.notificationDailyCapEmail : 500)
      : (typeof settings.notificationDailyCapSms === 'number' ? settings.notificationDailyCapSms : 100);

    if (dailyCap !== null) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayCount = await this.notificationRepo.countByTenantChannelSince(
        notification.tenantId,
        notification.channel,
        todayStart,
      );
      if (todayCount >= dailyCap) {
        notification.status = 'FAILED';
        notification.failedAt = new Date();
        notification.failureReason = 'BUDGET_EXCEEDED';
        notification.updatedAt = new Date();
        await this.notificationRepo.update(notification);
        this.auditTerminalFailure(notification);
        this.logger.error(
          {
            notificationId: notification.id,
            tenantId: notification.tenantId,
            channel: notification.channel,
            todayCount,
            dailyCap,
          },
          'notification.budget_exceeded: marked FAILED, will not retry',
        );
        return;
      }
    }

    // Deterministic pre-flight: an unnormalizable phone number will fail on every
    // attempt, so fail fast without burning retries or a provider call.
    let smsRecipient: string | null = null;
    if (notification.channel === 'SMS') {
      smsRecipient = toE164Au(notification.recipient);
      if (!smsRecipient) {
        notification.status = 'FAILED';
        notification.failedAt = new Date();
        notification.failureReason = 'INVALID_RECIPIENT_PHONE';
        notification.nextRetryAt = null;
        notification.updatedAt = new Date();
        await this.notificationRepo.update(notification);
        this.auditTerminalFailure(notification);
        this.logger.error(
          { notificationId: notification.id, recipientMasked: maskRecipient(notification.recipient) },
          'notification.invalid_recipient_phone: marked FAILED, will not retry',
        );
        return;
      }
    }

    // GAP-004: Validate template variables (warn but don't fail)
    const variables: Record<string, string> = { ...notification.payloadJson };

    const allTemplateContent = [template.subject, template.bodyHtml, template.bodyText]
      .filter(Boolean)
      .join(' ');
    const missingVars = this.templateRenderer.validateVariables(allTemplateContent, variables);
    if (missingVars.length > 0) {
      this.logger.warn(
        {
          notificationId: notification.id,
          templateCode: notification.templateCode,
          missingVariables: missingVars,
        },
        'notification.missing_variable: template has placeholders without matching payload keys',
      );
      this.metrics.incrementMissingVariableCount(missingVars.length);
    }

    // Shared render pipeline. EMAIL: Handlebars → sanitize → html-to-text.
    // SMS: Handlebars over body_text only — see renderEmailBody.
    const { renderedSubject, renderedBodyHtml, renderedBodyText } = renderEmailBody(
      {
        channel: notification.channel,
        bodyHtmlSource: template.bodyHtml ?? '',
        bodyTextSource: template.bodyText,
        subject: template.subject,
        variables,
      },
      {
        templateRenderer: this.templateRenderer,
        htmlSanitizer: this.htmlSanitizer,
        htmlToText: this.htmlToText,
      },
    );

    // Deterministic pre-flight: an empty rendered SMS body would waste a provider
    // call/credit on every attempt (mirrors the test-send guard), so fail fast.
    if (notification.channel === 'SMS' && renderedBodyText.trim().length === 0) {
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = 'EMPTY_SMS_BODY';
      notification.nextRetryAt = null;
      notification.updatedAt = new Date();
      await this.notificationRepo.update(notification);
      this.auditTerminalFailure(notification);
      this.logger.error(
        { notificationId: notification.id, templateCode: notification.templateCode },
        'notification.empty_sms_body: marked FAILED, will not retry',
      );
      return;
    }

    // GAP-009: Create attempt record at the start
    const attemptNumber = notification.retryCount + 1;
    const attempt = new NotificationAttemptEntity({
      id: randomUUID(),
      notificationId: notification.id,
      attemptNumber,
      status: 'PENDING',
      providerError: null,
      startedAt: new Date(),
      finishedAt: null,
    });
    await this.attemptRepo.save(attempt);

    try {
      let messageId: string;

      if (notification.channel === 'EMAIL') {
        const result = await this.emailProvider.send(
          notification.recipient,
          renderedSubject,
          renderedBodyHtml,
          renderedBodyText,
        );
        messageId = result.messageId;
        notification.providerName = 'resend';
      } else {
        const prepared = prepareSmsBody(renderedBodyText);
        if (prepared.truncated) {
          this.logger.warn(
            { notificationId: notification.id, originalLength: renderedBodyText.length },
            'notification.sms_body_truncated: rendered body exceeded the provider limit',
          );
        }
        const result = await this.smsProvider.send(smsRecipient ?? notification.recipient, prepared.body, {
          idempotencyKey: `${notification.id}-${attemptNumber}`,
          customRef: notification.id,
          enableUnicode: prepared.unicode,
        });
        messageId = result.messageId;
        notification.providerName = 'mobile-message';
      }

      notification.status = 'SENT';
      notification.sentAt = new Date();
      notification.providerMessageId = messageId;

      // GAP-009: Mark attempt as successful
      attempt.markSuccess();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown provider error';

      // GAP-009: Mark attempt as failed
      attempt.markFailed(errorMessage);

      notification.retryCount += 1;

      if (notification.retryCount >= MAX_RETRY_COUNT) {
        notification.status = 'FAILED';
        notification.failedAt = new Date();
        notification.failureReason = errorMessage;
      } else {
        notification.nextRetryAt = calculateNextRetryAt(notification.retryCount);
      }
    }

    // GAP-009: Update attempt record with final status
    await this.attemptRepo.update(attempt);

    notification.updatedAt = new Date();
    await this.notificationRepo.update(notification);

    // Provider failures reach here on every attempt; only the one that exhausted
    // the retries is terminal, and only that one belongs on the timeline.
    if (notification.status === 'FAILED') {
      this.auditTerminalFailure(notification);
    }

    // Once SENT, the payload will never be re-rendered (delivery receipts and
    // webhooks only touch status), so secret-bearing values can be redacted at
    // rest. A scrub failure must never fail the job after a successful send.
    if (notification.status === 'SENT') {
      try {
        await this.notificationRepo.scrubPayload(
          notification.id,
          notification.tenantId,
          SENSITIVE_PAYLOAD_KEYS,
          REDACTED_PAYLOAD_VALUE,
        );
      } catch (error) {
        this.logger.warn(
          {
            notificationId: notification.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'notification.payload_scrub_failed: secrets remain in payload_json',
        );
      }
    }
  }
}
