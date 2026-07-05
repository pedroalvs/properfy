import type { INotificationRepository } from '../../domain/notification.repository';
import type { ISmsProvider } from '../../domain/providers';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { NotificationStatus } from '@properfy/shared';

/**
 * Reconciles SMS delivery status by polling the provider (GET /v1/messages).
 *
 * The delivery webhook is the primary signal, but it is best-effort: MobileMessage
 * does not retry indefinitely and receipts can be lost. Without reconciliation a
 * notification stays SENT forever. This job sweeps SENT SMS rows in the
 * [now-72h, now-10min] window — old enough for the webhook to have had a chance,
 * recent enough to still matter — and applies the provider's authoritative status.
 * Rows older than 72h are left as SENT (terminal-unknown).
 */

const WINDOW_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const WINDOW_MIN_AGE_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 100;

export interface PollSmsDeliveryResult {
  delivered: number;
  failed: number;
  unchanged: number;
  errors: number;
}

export class PollSmsDeliveryUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly smsProvider: ISmsProvider,
    private readonly logger: Logger,
  ) {}

  async execute(now: Date): Promise<PollSmsDeliveryResult> {
    const from = new Date(now.getTime() - WINDOW_MAX_AGE_MS);
    const to = new Date(now.getTime() - WINDOW_MIN_AGE_MS);
    const rows = await this.notificationRepo.findSmsAwaitingDeliveryReceipt(from, to, BATCH_LIMIT);

    const result: PollSmsDeliveryResult = { delivered: 0, failed: 0, unchanged: 0, errors: 0 };

    for (const notification of rows) {
      if (!notification.providerMessageId) {
        result.unchanged += 1;
        continue;
      }
      try {
        const providerStatus = await this.smsProvider.getStatus(notification.providerMessageId);

        if (providerStatus === 'delivered') {
          notification.status = 'DELIVERED' as NotificationStatus;
          notification.deliveredAt = new Date();
          notification.updatedAt = new Date();
          await this.notificationRepo.update(notification);
          result.delivered += 1;
        } else if (providerStatus === 'failed' || providerStatus === 'cancelled') {
          notification.status = 'FAILED' as NotificationStatus;
          notification.failedAt = new Date();
          notification.failureReason = `Provider mobile-message reported: ${providerStatus}`;
          notification.updatedAt = new Date();
          await this.notificationRepo.update(notification);
          result.failed += 1;
        } else {
          // pending/scheduled/sent/unknown — still in flight, next sweep retries
          result.unchanged += 1;
        }
      } catch (error) {
        result.errors += 1;
        this.logger.warn(
          {
            notificationId: notification.id,
            providerMessageId: notification.providerMessageId,
            error: error instanceof Error ? error.message : String(error),
          },
          'notification.sms_delivery_poll_error: provider status lookup failed',
        );
      }
    }

    return result;
  }
}
