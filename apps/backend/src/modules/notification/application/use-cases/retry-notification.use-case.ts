import type { AuthContext } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  NotificationPayloadScrubbedError,
} from '../../domain/notification.errors';
import {
  REDACTED_PAYLOAD_VALUE,
  SENSITIVE_PAYLOAD_KEYS,
} from '../../domain/notification.constants';

export interface RetryNotificationInput {
  notificationId: string;
  actor: AuthContext;
}

export interface RetryNotificationOutput {
  notificationId: string;
  status: 'PENDING';
  retriedAt: string;
}

export class RetryNotificationUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly jobQueue: IJobQueue,
    private readonly logger?: Logger,
  ) {}

  async execute(input: RetryNotificationInput): Promise<RetryNotificationOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'notification.retry',
      entityType: 'Notification',
    });

    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeRetried()) {
      throw new NotificationInvalidStatusError();
    }

    // A scrubbed payload would render "[REDACTED]" into the outgoing message.
    // Only sensitive keys are inspected so an ordinary payload value that
    // happens to contain the marker text never blocks a retry.
    if (
      SENSITIVE_PAYLOAD_KEYS.some(
        (key) => notification.payloadJson[key] === REDACTED_PAYLOAD_VALUE,
      )
    ) {
      throw new NotificationPayloadScrubbedError();
    }

    const now = new Date();

    notification.status = 'PENDING';
    notification.retryCount = 0;
    notification.nextRetryAt = null;
    notification.failedAt = null;
    notification.failureReason = null;
    notification.updatedAt = now;

    await this.notificationRepo.update(notification);

    // Enqueue the send job, exactly as CreateNotificationUseCase does. Without
    // this the row sits PENDING with retryCount=0, which findRetryable ignores
    // (it requires retry_count > 0), so the manual retry did nothing until the
    // stuck-pending sweep rescued it ~10-15 min later, mislabeled as a lost
    // enqueue. Enqueue failure throws (same contract as create) so the caller
    // learns the retry did not take.
    const jobName = 'notification.send';
    this.logger?.info({ notificationId: input.notificationId, jobName }, 'notification.enqueue_start');
    try {
      await this.jobQueue.enqueue(jobName, { notificationId: input.notificationId }, {
        retryLimit: 0,
        singletonKey: input.notificationId,
        expireInMinutes: 5,
      });
      this.logger?.info({ notificationId: input.notificationId, jobName }, 'notification.enqueue_success');
    } catch (enqueueError) {
      this.logger?.error({ notificationId: input.notificationId, jobName, error: enqueueError }, 'notification.enqueue_failed');
      throw enqueueError;
    }

    this.auditService.log({
      action: 'NOTIFICATION_MANUALLY_RETRIED',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION',
      entityId: input.notificationId,
      tenantId: notification.tenantId,
    });

    return {
      notificationId: input.notificationId,
      status: 'PENDING',
      retriedAt: now.toISOString(),
    };
  }
}
