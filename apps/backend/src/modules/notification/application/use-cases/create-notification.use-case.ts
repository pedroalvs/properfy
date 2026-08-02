import { randomUUID } from 'node:crypto';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { NotificationEntity } from '../../domain/notification.entity';
import { ValidationError } from '../../../../shared/domain/errors';
import { MarketingDispatchDisabledError } from '../../domain/notification.errors';

export interface CreateNotificationInput {
  /** Optional idempotency authority supplied by a caller with a deterministic identity. */
  notificationId?: string;
  /** null = platform-scoped notification (recipient belongs to no agency). */
  tenantId: string | null;
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
    private readonly logger?: Logger,
  ) {}

  async execute(input: CreateNotificationInput): Promise<CreateNotificationOutput> {
    // null is a deliberate scope (the platform owns the notification); a blank
    // string is still a caller bug.
    if (input.tenantId !== null && !input.tenantId.trim()) {
      throw new ValidationError('tenantId is required');
    }

    // Feature 018 T032: stamp the effective notificationClass at create time.
    // Resolve from the tenant-scoped template first, fall back to the platform
    // default template. The override is only honored when active — an inactive
    // override falls through to the platform default (which is used as-is). If
    // neither resolves, leave it null — the send worker will mark the
    // notification FAILED (TEMPLATE_NOT_FOUND) later, which is the correct
    // failure path.
    let notificationClass: NotificationClass | null = null;
    const tenantTemplate = await this.templateRepo.findByTenantCodeChannel(
      input.tenantId,
      input.templateCode,
      input.channel,
    );
    if (tenantTemplate && tenantTemplate.isActive()) {
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

    if (notificationClass === 'MARKETING') {
      throw new MarketingDispatchDisabledError();
    }

    const now = new Date();
    const notificationId = input.notificationId ?? randomUUID();
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
    if (input.notificationId !== undefined) {
      const inserted = await this.notificationRepo.saveIfAbsent(notification);
      if (!inserted) return { notificationId };
    } else {
      await this.notificationRepo.save(notification);
    }
    const jobName = 'notification.send';
    this.logger?.info({ notificationId, jobName, channel: input.channel, templateCode: input.templateCode }, 'notification.enqueue_start');
    try {
      await this.jobQueue.enqueue(jobName, { notificationId }, {
        retryLimit: 0,          // pg-boss auto-retry disabled; worker self-reschedules (T047)
        singletonKey: notificationId, // dedup: only one job per Notification row at a time
        expireInMinutes: 5,     // stalled jobs are reclaimed after 5 minutes
      });
      this.logger?.info({ notificationId, jobName }, 'notification.enqueue_success');
    } catch (enqueueError) {
      this.logger?.error({ notificationId, jobName, channel: input.channel, templateCode: input.templateCode, error: enqueueError }, 'notification.enqueue_failed');
      throw enqueueError;
    }
    return { notificationId };
  }
}
