import type { INotificationRepository } from '../../domain/notification.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

const DEFAULT_BATCH_LIMIT = 500;

/** Grace period before a never-enqueued PENDING row is considered stuck (in-flight jobs are younger). */
const STUCK_GRACE_MS = 10 * 60 * 1000;

/** Stuck rows older than this are stale — failing them beats sending an obsolete email. */
const STUCK_MAX_AGE_MS = 72 * 60 * 60 * 1000;

const SEND_JOB_OPTIONS = {
  retryLimit: 0,
  expireInMinutes: 5,
} as const;

export interface PollRetryableNotificationsOutput {
  enqueuedCount: number;
  hasMore: boolean;
  stuckReenqueuedCount: number;
  stuckFailedCount: number;
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
        ...SEND_JOB_OPTIONS,
        singletonKey: notification.id,
      });
    }

    const { stuckReenqueuedCount, stuckFailedCount } = await this.healStuckPending(now);

    return { enqueuedCount: batch.length, hasMore, stuckReenqueuedCount, stuckFailedCount };
  }

  /**
   * Self-heal PENDING rows whose enqueue was lost (e.g. pg-boss send() threw
   * after the row was saved): re-enqueue recent ones, fail stale ones so an
   * obsolete reminder is never delivered days later.
   */
  private async healStuckPending(now: Date): Promise<{ stuckReenqueuedCount: number; stuckFailedCount: number }> {
    const graceCutoff = new Date(now.getTime() - STUCK_GRACE_MS);
    const staleCutoff = new Date(now.getTime() - STUCK_MAX_AGE_MS);
    const stuck = await this.notificationRepo.findStuckPending(graceCutoff, this.batchLimit + 1);

    let stuckReenqueuedCount = 0;
    let stuckFailedCount = 0;

    for (const notification of stuck.slice(0, this.batchLimit)) {
      if (notification.createdAt < staleCutoff) {
        notification.status = 'FAILED';
        notification.failedAt = now;
        notification.failureReason = 'STUCK_NEVER_ENQUEUED';
        await this.notificationRepo.update(notification);
        stuckFailedCount += 1;
      } else {
        await this.jobQueue.enqueue('notification.send', { notificationId: notification.id }, {
          ...SEND_JOB_OPTIONS,
          singletonKey: notification.id,
        });
        stuckReenqueuedCount += 1;
      }
    }

    if (stuckReenqueuedCount > 0 || stuckFailedCount > 0) {
      this.logger?.warn(
        { stuckReenqueuedCount, stuckFailedCount },
        'Self-healed notifications whose enqueue was lost',
      );
    }

    return { stuckReenqueuedCount, stuckFailedCount };
  }
}
