import type { AuthContext } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import { NotificationNotFoundError } from '../../domain/notification.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface GetNotificationInput {
  notificationId: string;
  actor: AuthContext;
}

export interface NotificationDetailOutput {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  recipient: string;
  channel: string;
  templateCode: string;
  status: string;
  providerName: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  payloadJson: Record<string, string>;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GetNotificationUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetNotificationInput): Promise<NotificationDetailOutput> {
    const { notificationId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'notification.view',
      entityType: 'Notification',
    });

    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    return {
      id: notification.id,
      tenantId: notification.tenantId,
      appointmentId: notification.appointmentId,
      recipient: notification.recipient,
      channel: notification.channel,
      templateCode: notification.templateCode,
      status: notification.status,
      providerName: notification.providerName,
      providerMessageId: notification.providerMessageId,
      sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
      deliveredAt: notification.deliveredAt ? notification.deliveredAt.toISOString() : null,
      failedAt: notification.failedAt ? notification.failedAt.toISOString() : null,
      failureReason: notification.failureReason,
      payloadJson: notification.payloadJson,
      retryCount: notification.retryCount,
      nextRetryAt: notification.nextRetryAt ? notification.nextRetryAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }
}
