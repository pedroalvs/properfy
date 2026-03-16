import type { AuthContext } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  NotificationForbiddenError,
} from '../../domain/notification.errors';

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
  ) {}

  async execute(input: RetryNotificationInput): Promise<RetryNotificationOutput> {
    const { actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new NotificationForbiddenError();
    }

    const notification = await this.notificationRepo.findById(input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.canBeRetried()) {
      throw new NotificationInvalidStatusError();
    }

    const now = new Date();

    notification.status = 'PENDING';
    notification.retryCount = 0;
    notification.nextRetryAt = null;
    notification.failedAt = null;
    notification.failureReason = null;
    notification.updatedAt = now;

    await this.notificationRepo.update(notification);

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
