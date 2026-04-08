import { randomUUID } from 'node:crypto';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { INotificationAttemptRepository } from '../../domain/notification-attempt.repository';
import type { IEmailProvider, ISmsProvider, IWhatsAppProvider } from '../../domain/providers';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import { NotificationAttemptEntity } from '../../domain/notification-attempt.entity';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  TemplateNotFoundError,
} from '../../domain/notification.errors';
import { MAX_RETRY_COUNT, RETRY_DELAYS, JITTER_FACTOR } from '../../domain/notification.constants';

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
  whatsAppProvider: IWhatsAppProvider;
  templateRenderer: TemplateRendererService;
  logger: Logger;
  metrics: MetricsCollector;
  getTenantSettings: (tenantId: string) => Promise<Record<string, unknown>>;
}

export class SendNotificationUseCase {
  private readonly notificationRepo: INotificationRepository;
  private readonly templateRepo: INotificationTemplateRepository;
  private readonly consentRepo: INotificationConsentRepository;
  private readonly attemptRepo: INotificationAttemptRepository;
  private readonly emailProvider: IEmailProvider;
  private readonly smsProvider: ISmsProvider;
  private readonly whatsAppProvider: IWhatsAppProvider;
  private readonly templateRenderer: TemplateRendererService;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly getTenantSettings: (tenantId: string) => Promise<Record<string, unknown>>;

  constructor(deps: SendNotificationDeps) {
    this.notificationRepo = deps.notificationRepo;
    this.templateRepo = deps.templateRepo;
    this.consentRepo = deps.consentRepo;
    this.attemptRepo = deps.attemptRepo;
    this.emailProvider = deps.emailProvider;
    this.smsProvider = deps.smsProvider;
    this.whatsAppProvider = deps.whatsAppProvider;
    this.templateRenderer = deps.templateRenderer;
    this.logger = deps.logger;
    this.metrics = deps.metrics;
    this.getTenantSettings = deps.getTenantSettings;
  }

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeSent()) {
      throw new NotificationInvalidStatusError();
    }

    // GAP-001: Check consent opt-out
    const consent = await this.consentRepo.findByRecipientChannelTenant(
      notification.recipient,
      notification.channel,
      notification.tenantId,
    );
    if (consent?.isOptedOut()) {
      notification.status = 'SKIPPED';
      notification.failureReason = 'CONSENT_OPT_OUT';
      notification.updatedAt = new Date();
      await this.notificationRepo.update(notification);
      return;
    }

    // GAP-003: Check daily budget cap
    const settings = await this.getTenantSettings(notification.tenantId);
    const dailyCap = notification.channel === 'EMAIL'
      ? (typeof settings.notificationDailyCapEmail === 'number' ? settings.notificationDailyCapEmail : 500)
      : notification.channel === 'SMS'
        ? (typeof settings.notificationDailyCapSms === 'number' ? settings.notificationDailyCapSms : 100)
        : null; // No cap for WhatsApp by default

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

    // Template lookup: tenant-specific first, then platform default
    let template = await this.templateRepo.findByTenantCodeChannel(
      notification.tenantId,
      notification.templateCode,
      notification.channel,
    );
    if (!template) {
      template = await this.templateRepo.findByTenantCodeChannel(
        null,
        notification.templateCode,
        notification.channel,
      );
    }
    if (!template) {
      throw new TemplateNotFoundError();
    }

    // GAP-002: WhatsApp template approval check
    if (notification.channel === 'WHATSAPP' && !template.isWhatsAppApproved()) {
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = 'WHATSAPP_TEMPLATE_NOT_APPROVED';
      notification.updatedAt = new Date();
      await this.notificationRepo.update(notification);
      return;
    }

    // GAP-004: Validate template variables (warn but don't fail)
    const variables = notification.payloadJson;
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

    // Render template
    const renderedSubject = template.subject
      ? this.templateRenderer.render(template.subject, variables)
      : '';
    const renderedBodyHtml = template.bodyHtml
      ? this.templateRenderer.render(template.bodyHtml, variables)
      : '';
    const renderedBodyText = this.templateRenderer.render(template.bodyText, variables);

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
      } else if (notification.channel === 'SMS') {
        const result = await this.smsProvider.send(notification.recipient, renderedBodyText);
        messageId = result.messageId;
        notification.providerName = 'twilio';
      } else {
        const result = await this.whatsAppProvider.send(notification.recipient, renderedBodyText);
        messageId = result.messageId;
        notification.providerName = 'zenvia';
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
