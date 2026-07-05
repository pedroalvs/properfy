import type { INotificationRepository } from '../../domain/notification.repository';
import type { NotificationStatus } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';

export interface HandleProviderWebhookInput {
  provider: string;
  providerMessageId: string;
  event: string;
  occurredAt: string;
  rawPayload: unknown;
}

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  FAILED: 3,
};

export class HandleProviderWebhookUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: HandleProviderWebhookInput): Promise<void> {
    const notification = await this.notificationRepo.findByProviderMessageId(
      input.providerMessageId,
    );

    if (!notification) {
      // Ack (200) so the provider does not retry, but leave a trace: a burst of
      // unmatched receipts means lost correlation, not noise.
      this.logger?.warn(
        { provider: input.provider, providerMessageId: input.providerMessageId, event: input.event },
        'notification.webhook_unmatched: no notification for providerMessageId',
      );
      return;
    }

    const currentPriority = STATUS_PRIORITY[notification.status] ?? 0;

    if (input.event === 'delivered') {
      if (currentPriority < (STATUS_PRIORITY['DELIVERED'] ?? 2)) {
        notification.status = 'DELIVERED' as NotificationStatus;
        notification.deliveredAt = new Date(input.occurredAt);
      } else {
        return;
      }
    } else if (input.event === 'failed' || input.event === 'bounced') {
      if (notification.status !== 'DELIVERED') {
        notification.status = 'FAILED' as NotificationStatus;
        notification.failedAt = new Date(input.occurredAt);
        notification.failureReason = `Provider ${input.provider} reported: ${input.event}`;
      } else {
        return;
      }
    } else {
      // Events like 'clicked', 'opened' do not change status
      return;
    }

    notification.updatedAt = new Date();
    await this.notificationRepo.update(notification);
  }
}
