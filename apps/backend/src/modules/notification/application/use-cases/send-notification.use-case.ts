import { randomUUID } from 'node:crypto';
import { toE164Au, type NotificationClass } from '@properfy/shared';
import { prepareSmsBody } from '../../domain/sms-content';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { INotificationAttemptRepository } from '../../domain/notification-attempt.repository';
import type { IEmailProvider, ISmsProvider } from '../../domain/providers';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../../domain/html-to-text.service';
import type { IImagePlaceholderResolver } from '../../domain/image-placeholder-resolver.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { ITemplateImageBindingRepository } from '../../domain/template-image-binding.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import { NotificationAttemptEntity } from '../../domain/notification-attempt.entity';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
} from '../../domain/notification.errors';
import { MAX_RETRY_COUNT, RETRY_DELAYS, JITTER_FACTOR } from '../../domain/notification.constants';
import { renderEmailBody } from '../render-email-body';

export interface SendNotificationInput {
  notificationId: string;
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
  getTenantSettings: (tenantId: string) => Promise<Record<string, unknown>>;
  /** Feature 030: render-profile HTML sanitizer (defense-in-depth) */
  htmlSanitizer?: IHtmlSanitizerService;
  /** Feature 030: HTML → plain text derivation */
  htmlToText?: IHtmlToTextService;
  /** Feature 030: {{image:key}} placeholder resolver */
  imagePlaceholderResolver?: IImagePlaceholderResolver;
  /** Feature 030: email asset repository (marks ever_sent, resolves bindings) */
  emailAssetRepo?: IEmailAssetRepository;
  /** Feature 030: template image binding repository */
  templateImageBindingRepo?: ITemplateImageBindingRepository;
  /** Feature 030: public URL base for the email-assets bucket */
  emailAssetsPublicUrlBase?: string;
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
  private readonly getTenantSettings: (tenantId: string) => Promise<Record<string, unknown>>;
  private readonly htmlSanitizer?: IHtmlSanitizerService;
  private readonly htmlToText?: IHtmlToTextService;
  private readonly imagePlaceholderResolver?: IImagePlaceholderResolver;
  private readonly emailAssetRepo?: IEmailAssetRepository;
  private readonly templateImageBindingRepo?: ITemplateImageBindingRepository;
  private readonly emailAssetsPublicUrlBase?: string;

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
    this.htmlSanitizer = deps.htmlSanitizer;
    this.htmlToText = deps.htmlToText;
    this.imagePlaceholderResolver = deps.imagePlaceholderResolver;
    this.emailAssetRepo = deps.emailAssetRepo;
    this.templateImageBindingRepo = deps.templateImageBindingRepo;
    this.emailAssetsPublicUrlBase = deps.emailAssetsPublicUrlBase;
  }

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeSent()) {
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

    const settings = await this.getTenantSettings(notification.tenantId);

    // Per-agency email kill switch: some agencies send their own emails. When
    // disabled, skip EMAIL sends (SMS is unaffected). Missing key = enabled.
    if (notification.channel === 'EMAIL' && settings.emailSendingEnabled === false) {
      notification.status = 'SKIPPED_OPT_OUT';
      notification.failureReason = 'AGENCY_EMAIL_DISABLED';
      notification.updatedAt = new Date();
      await this.notificationRepo.update(notification);
      this.logger.info(
        { notificationId: notification.id, tenantId: notification.tenantId },
        'notification.skipped_agency_email_disabled',
      );
      return;
    }

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
        this.logger.error(
          { notificationId: notification.id, recipient: notification.recipient },
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

    // Feature 030: shared render pipeline (image-resolve → Handlebars → sanitize → html-to-text)
    const { renderedSubject, renderedBodyHtml, renderedBodyText, resolvedAssetIds } = await renderEmailBody(
      {
        templateId: template.id,
        bodyHtmlSource: template.bodyHtml ?? '',
        bodyTextSource: template.bodyText,
        subject: template.subject,
        variables,
      },
      {
        templateRenderer: this.templateRenderer,
        htmlSanitizer: this.htmlSanitizer,
        htmlToText: this.htmlToText,
        imagePlaceholderResolver: this.imagePlaceholderResolver,
        emailAssetRepo: this.emailAssetRepo,
        templateImageBindingRepo: this.templateImageBindingRepo,
        emailAssetsPublicUrlBase: this.emailAssetsPublicUrlBase,
      },
    );

    // Feature 030: mark resolved assets as ever_sent
    if (resolvedAssetIds.length > 0 && this.emailAssetRepo) {
      await this.emailAssetRepo.markEverSent(resolvedAssetIds);
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
        const delayIndex = Math.min(notification.retryCount - 1, RETRY_DELAYS.length - 1);
        const baseDelay = RETRY_DELAYS[delayIndex] ?? RETRY_DELAYS[0]!;
        const jitter = baseDelay * JITTER_FACTOR * (2 * Math.random() - 1);
        const delayMs = baseDelay + jitter;
        notification.nextRetryAt = new Date(Date.now() + delayMs);
      }
    }

    // GAP-009: Update attempt record with final status
    await this.attemptRepo.update(attempt);

    notification.updatedAt = new Date();
    await this.notificationRepo.update(notification);
  }
}
