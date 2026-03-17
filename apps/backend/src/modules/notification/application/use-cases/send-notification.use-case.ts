import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { IEmailProvider, ISmsProvider, IWhatsAppProvider } from '../../domain/providers';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  TemplateNotFoundError,
} from '../../domain/notification.errors';
import { MAX_RETRY_COUNT, RETRY_DELAYS, JITTER_FACTOR } from '../../domain/notification.constants';

export interface SendNotificationInput {
  notificationId: string;
}

export class SendNotificationUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly emailProvider: IEmailProvider,
    private readonly smsProvider: ISmsProvider,
    private readonly whatsAppProvider: IWhatsAppProvider,
    private readonly templateRenderer: TemplateRendererService,
  ) {}

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeSent()) {
      throw new NotificationInvalidStatusError();
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

    // Render template
    const variables = notification.payloadJson;
    const renderedSubject = template.subject
      ? this.templateRenderer.render(template.subject, variables)
      : '';
    const renderedBodyHtml = template.bodyHtml
      ? this.templateRenderer.render(template.bodyHtml, variables)
      : '';
    const renderedBodyText = this.templateRenderer.render(template.bodyText, variables);

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
    } catch (error) {
      notification.retryCount += 1;

      if (notification.retryCount >= MAX_RETRY_COUNT) {
        notification.status = 'FAILED';
        notification.failedAt = new Date();
        notification.failureReason =
          error instanceof Error ? error.message : 'Unknown provider error';
      } else {
        const delayIndex = Math.min(notification.retryCount - 1, RETRY_DELAYS.length - 1);
        const baseDelay = RETRY_DELAYS[delayIndex] ?? RETRY_DELAYS[0]!;
        const jitter = baseDelay * JITTER_FACTOR * (2 * Math.random() - 1);
        const delayMs = baseDelay + jitter;
        notification.nextRetryAt = new Date(Date.now() + delayMs);
      }
    }

    notification.updatedAt = new Date();
    await this.notificationRepo.update(notification);
  }
}
