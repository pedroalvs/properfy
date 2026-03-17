import type { INotificationRepository } from '../../domain/notification.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';

export interface PollRetryableNotificationsOutput {
  enqueuedCount: number;
}

export class PollRetryableNotificationsUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly jobQueue: IJobQueue,
  ) {}

  async execute(): Promise<PollRetryableNotificationsOutput> {
    const now = new Date();
    const retryable = await this.notificationRepo.findRetryable(now);
    for (const notification of retryable) {
      await this.jobQueue.enqueue('notification.send', { notificationId: notification.id }, { retryLimit: 0 });
    }
    return { enqueuedCount: retryable.length };
  }
}
