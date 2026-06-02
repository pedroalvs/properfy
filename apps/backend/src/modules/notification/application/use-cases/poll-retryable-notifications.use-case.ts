import type { INotificationRepository } from '../../domain/notification.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

const DEFAULT_BATCH_LIMIT = 500;

export interface PollRetryableNotificationsOutput {
  enqueuedCount: number;
  hasMore: boolean;
}

export class PollRetryableNotificationsUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly jobQueue: IJobQueue,
    private readonly logger?: Logger,
    private readonly batchLimit: number = DEFAULT_BATCH_LIMIT,
  ) {}

  async execute(): Promise<PollRetryableNotificationsOutput> {
    const now = new Date();
    const retryable = await this.notificationRepo.findRetryable(now, this.batchLimit + 1);

    const hasMore = retryable.length > this.batchLimit;
    const batch = hasMore ? retryable.slice(0, this.batchLimit) : retryable;

    if (hasMore) {
      this.logger?.warn(
        { batchLimit: this.batchLimit },
        'Retryable notifications exceeded batch limit; remaining will be processed in the next poll cycle',
      );
    }

    for (const notification of batch) {
      await this.jobQueue.enqueue('notification.send', { notificationId: notification.id }, {
        retryLimit: 0,
        singletonKey: notification.id,
        expireInMinutes: 5,
      });
    }
    return { enqueuedCount: batch.length, hasMore };
  }
}
