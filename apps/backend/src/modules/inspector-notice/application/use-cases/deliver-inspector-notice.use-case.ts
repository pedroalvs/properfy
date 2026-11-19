import {
  INSPECTOR_NOTICE_PUSH_BODY_MAX_CHARS,
  PLATFORM_TIMEZONE,
  buildInspectorNoticeSmsMessage,
  resolveInspectorNoticeTargetPath,
} from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';
import {
  civilDateInTimezone,
  hourInTimezone,
  parseDateInTimezone,
} from '../../../../shared/domain/timezone-date';
import type { InspectorNoticeEntity } from '../../domain/inspector-notice.entity';
import type {
  DeliveryRecipientRow,
  IInspectorNoticeRepository,
} from '../../domain/inspector-notice.repository';
import type { IPushSender } from '../../domain/push-sender';
import type { IPushSubscriptionRepository } from '../../domain/push-subscription.repository';
import { getInspectorNoticeSmsNotificationId } from '../../domain/sms-notification-id';

const SMS_TEMPLATE_CODE = 'INSPECTOR_NOTICE_SMS';
const PUSH_TTL_SECONDS = 86_400;
const BATCH_SIZE = 50;
const SMS_BURST_THRESHOLD = 20;

/** Minimal slice of CreateNotificationUseCase the delivery job needs. */
export interface NotificationCreator {
  execute(input: {
    notificationId: string;
    tenantId: string | null;
    recipient: string;
    channel: 'SMS';
    templateCode: string;
    payloadJson: Record<string, string>;
  }): Promise<{ notificationId: string }>;
}

/** Minimal slice of the notification repository used for the daily SMS cap. */
export interface InspectorNoticeSmsCounter {
  countByTemplateChannelSince(
    tenantId: string | null,
    templateCode: string,
    channel: 'SMS',
    since: Date,
  ): Promise<number>;
}

export class DeliverInspectorNoticeUseCase {
  constructor(
    private readonly noticeRepo: IInspectorNoticeRepository,
    private readonly pushSubRepo: IPushSubscriptionRepository,
    private readonly pushSender: IPushSender,
    private readonly createNotification: NotificationCreator,
    private readonly smsCounter: InspectorNoticeSmsCounter,
    private readonly clock: Clock,
    /** INSPECTOR_NOTICE_SMS_DAILY_CAP; null = unlimited. */
    private readonly smsDailyCap: number | null,
    private readonly logger: Logger,
  ) {}

  async execute(input: { noticeId: string }): Promise<void> {
    const { noticeId } = input;
    const notice = await this.noticeRepo.findById(noticeId);
    if (!notice) {
      this.logger.warn({ noticeId }, 'inspector_notice.delivery_notice_missing');
      return;
    }

    const now = this.clock.now();
    const sydneyHour = hourInTimezone(now, PLATFORM_TIMEZONE);

    if (notice.archivedAt) {
      await this.stopForArchive(noticeId, 0);
      return;
    }

    await this.noticeRepo.markDeliveryStarted(noticeId, now);

    const counters = {
      recipients: 0,
      pushSent: 0,
      pushGone: 0,
      pushRejected: 0,
      pushFailed: 0,
      smsQueued: 0,
      smsSkippedNoPhone: 0,
      smsSkippedCap: 0,
    };
    let smsCapWarned = false;
    let dailySmsCount: number | null = null;
    const startOfSydneyDay = parseDateInTimezone(
      civilDateInTimezone(now, PLATFORM_TIMEZONE),
      PLATFORM_TIMEZONE,
    );

    // The initial read above already confirmed the first batch is not archived; from the
    // second batch onward we re-read archived_at so a mid-delivery archive stops sending (L-F02-10).
    let firstBatch = true;
    for (;;) {
      if (!firstBatch) {
        const current = await this.noticeRepo.findById(noticeId);
        if (current?.archivedAt) {
          await this.stopForArchive(noticeId, counters.recipients);
          return;
        }
      }
      firstBatch = false;

      const batch = await this.noticeRepo.listPendingDeliveryRecipients(noticeId, BATCH_SIZE);
      if (batch.length === 0) {
        break;
      }

      for (const recipient of batch) {
        await this.deliverToRecipient(notice, recipient, counters, {
          startOfSydneyDay,
          getDailyCount: async () => {
            if (dailySmsCount === null) {
              dailySmsCount = await this.smsCounter.countByTemplateChannelSince(
                null,
                SMS_TEMPLATE_CODE,
                'SMS',
                startOfSydneyDay,
              );
            }
            return dailySmsCount;
          },
          warnCapOnce: () => {
            if (!smsCapWarned) {
              this.logger.warn({ noticeId, cap: this.smsDailyCap }, 'inspector_notice.sms_cap_reached');
              smsCapWarned = true;
            }
          },
        });
      }
    }

    await this.noticeRepo.markDeliveryCompleted(noticeId, this.clock.now());

    if (counters.smsQueued >= SMS_BURST_THRESHOLD) {
      this.logger.warn({ noticeId, smsQueued: counters.smsQueued }, 'inspector_notice.sms_burst');
    }
    this.logger.info({ noticeId, ...counters, sydneyHour }, 'inspector_notice.delivery_completed');
  }

  private async stopForArchive(noticeId: string, processed: number): Promise<void> {
    const skipped = await this.noticeRepo.markAllPendingProcessed(noticeId, this.clock.now());
    await this.noticeRepo.markDeliveryCompleted(noticeId, this.clock.now());
    this.logger.info(
      { noticeId, processed, skipped },
      'inspector_notice.delivery_skipped_archived',
    );
  }

  private async deliverToRecipient(
    notice: InspectorNoticeEntity,
    recipient: DeliveryRecipientRow,
    counters: {
      recipients: number;
      pushSent: number;
      pushGone: number;
      pushRejected: number;
      pushFailed: number;
      smsQueued: number;
      smsSkippedNoPhone: number;
      smsSkippedCap: number;
    },
    cap: {
      startOfSydneyDay: Date;
      getDailyCount: () => Promise<number>;
      warnCapOnce: () => void;
    },
  ): Promise<void> {
    counters.recipients += 1;

    // Inspector gone inactive / soft-deleted since publish: mark processed, send nothing.
    if (recipient.inspectorStatus !== 'ACTIVE' || recipient.inspectorDeleted) {
      await this.noticeRepo.markRecipientProcessed(notice.id, recipient.inspectorId, this.clock.now());
      return;
    }

    const pushReached = await this.sendPush(notice, recipient.inspectorId, counters);

    if (notice.critical && !pushReached) {
      await this.maybeSendSms(notice, recipient, counters, cap);
    }

    await this.noticeRepo.markRecipientProcessed(notice.id, recipient.inspectorId, this.clock.now());
  }

  private async sendPush(
    notice: InspectorNoticeEntity,
    inspectorId: string,
    counters: { pushSent: number; pushGone: number; pushRejected: number; pushFailed: number },
  ): Promise<boolean> {
    const subscriptions = await this.pushSubRepo.findActiveByInspector(inspectorId);
    const payload = {
      v: 1 as const,
      noticeId: notice.id,
      title: notice.title,
      body: truncatePushBody(notice.body),
      critical: notice.critical,
      url: resolveInspectorNoticeTargetPath(notice.id, notice.targetPath),
    };
    const opts = { ttlSeconds: PUSH_TTL_SECONDS, urgency: notice.critical ? ('high' as const) : ('normal' as const) };

    let reached = false;
    for (const subscription of subscriptions) {
      const result = await this.pushSender.send(subscription, payload, opts);
      switch (result.outcome) {
        case 'SENT':
          reached = true;
          counters.pushSent += 1;
          await this.pushSubRepo.resetFailure(subscription.endpoint);
          break;
        case 'GONE':
          counters.pushGone += 1;
          await this.pushSubRepo.revoke(subscription.endpoint, 'GONE', this.clock.now());
          this.logger.info(
            { noticeId: notice.id, inspectorId, statusCode: result.statusCode },
            'inspector_notice.push_gone_revoked',
          );
          break;
        case 'REJECTED':
          counters.pushRejected += 1;
          await this.pushSubRepo.revoke(subscription.endpoint, 'REJECTED', this.clock.now());
          this.logger.info(
            { noticeId: notice.id, inspectorId, statusCode: result.statusCode },
            'inspector_notice.push_rejected_revoked',
          );
          break;
        case 'FAILED': {
          counters.pushFailed += 1;
          this.logger.warn(
            { noticeId: notice.id, inspectorId, statusCode: result.statusCode },
            'inspector_notice.push_failed',
          );
          const newCount = await this.pushSubRepo.incrementFailure(subscription.endpoint);
          if (newCount !== null && newCount >= 5) {
            await this.pushSubRepo.revoke(subscription.endpoint, 'FAILED', this.clock.now());
            this.logger.info(
              { noticeId: notice.id, inspectorId },
              'inspector_notice.push_failed_revoked',
            );
          }
          break;
        }
        case 'DISABLED':
          break;
      }
    }
    return reached;
  }

  private async maybeSendSms(
    notice: InspectorNoticeEntity,
    recipient: DeliveryRecipientRow,
    counters: { smsQueued: number; smsSkippedNoPhone: number; smsSkippedCap: number },
    cap: { getDailyCount: () => Promise<number>; warnCapOnce: () => void },
  ): Promise<void> {
    if (!recipient.phone) {
      counters.smsSkippedNoPhone += 1;
      this.logger.warn(
        { noticeId: notice.id, inspectorId: recipient.inspectorId },
        'inspector_notice.sms_skipped_no_phone',
      );
      return;
    }

    if (this.smsDailyCap !== null) {
      const dailyCount = await cap.getDailyCount();
      if (dailyCount + counters.smsQueued >= this.smsDailyCap) {
        counters.smsSkippedCap += 1;
        cap.warnCapOnce();
        return;
      }
    }

    await this.createNotification.execute({
      notificationId: getInspectorNoticeSmsNotificationId(notice.id, recipient.inspectorId),
      tenantId: null,
      recipient: recipient.phone,
      channel: 'SMS',
      templateCode: SMS_TEMPLATE_CODE,
      payloadJson: { message: buildInspectorNoticeSmsMessage(notice.title, notice.body) },
    });
    counters.smsQueued += 1;
  }
}

function truncatePushBody(body: string): string {
  if (body.length <= INSPECTOR_NOTICE_PUSH_BODY_MAX_CHARS) {
    return body;
  }
  return `${body.slice(0, INSPECTOR_NOTICE_PUSH_BODY_MAX_CHARS - 1)}…`;
}
