import { randomUUID } from 'node:crypto';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import { NotificationEntity } from '../../domain/notification.entity';
import { ValidationError } from '../../../../shared/domain/errors';

export interface CreateNotificationInput {
  tenantId: string;
  appointmentId?: string;
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  payloadJson: Record<string, string>;
}

export interface CreateNotificationOutput {
  notificationId: string;
}

export class CreateNotificationUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly jobQueue: IJobQueue,
  ) {}

  async execute(input: CreateNotificationInput): Promise<CreateNotificationOutput> {
    if (!input.tenantId.trim()) {
      throw new ValidationError('tenantId is required');
    }

    // Feature 018 T032: stamp the effective notificationClass at create time.
    // Resolve from the tenant-scoped template first, fall back to the platform
    // default template. If neither exists, leave it null — the send worker will
    // throw TemplateNotFoundError later, which is the correct failure path.
    let notificationClass: NotificationClass | null = null;
    const tenantTemplate = await this.templateRepo.findByTenantCodeChannel(
      input.tenantId,
      input.templateCode,
      input.channel,
    );
    if (tenantTemplate) {
      notificationClass = tenantTemplate.notificationClass;
    } else {
      const defaultTemplate = await this.templateRepo.findByTenantCodeChannel(
        null,
        input.templateCode,
        input.channel,
      );
      if (defaultTemplate) {
        notificationClass = defaultTemplate.notificationClass;
      }
    }

    const now = new Date();
    const notificationId = randomUUID();
    const notification = new NotificationEntity({
      id: notificationId,
      tenantId: input.tenantId,
      appointmentId: input.appointmentId ?? null,
      recipient: input.recipient,
      channel: input.channel,
      templateCode: input.templateCode,
      status: 'PENDING',
      notificationClass,
      providerName: null,
      providerMessageId: null,
      sentAt: null,
      deliveredAt: null,
      failedAt: null,
      failureReason: null,
      payloadJson: input.payloadJson,
      retryCount: 0,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.notificationRepo.save(notification);
    await this.jobQueue.enqueue('notification.send', { notificationId }, { retryLimit: 0 });
    return { notificationId };
  }
}
