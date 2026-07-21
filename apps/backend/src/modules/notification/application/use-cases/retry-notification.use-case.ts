import type { AuthContext } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  NotificationPayloadScrubbedError,
} from '../../domain/notification.errors';
import { REDACTED_PAYLOAD_VALUE } from '../../domain/notification.constants';

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
    if (Object.values(notification.payloadJson).some((v) => v === REDACTED_PAYLOAD_VALUE)) {
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
