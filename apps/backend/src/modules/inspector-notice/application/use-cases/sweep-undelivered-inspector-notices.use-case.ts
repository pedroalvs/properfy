import { PLATFORM_TIMEZONE, getInspectorNoticeDeliverExpireMinutes } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import { hourInTimezone } from '../../../../shared/domain/timezone-date';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

const DELIVER_JOB = 'inspector-notice.deliver';
const MAX_PER_RUN = 100;
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 6;

/**
 * Safety sweep (D13, every 5 min). Re-enqueues delivery for notices within the last 24h
 * that either never started (2 min threshold) or started but did not complete with pending
 * recipients (20 min threshold, L-F02-03). Pauses 22:00–06:00 Sydney (L-F02-02); the
 * `singletonKey` prevents two active deliver jobs for the same notice.
 */
export class SweepUndeliveredInspectorNoticesUseCase {
  constructor(
    private readonly repo: IInspectorNoticeRepository,
    private readonly jobQueue: IJobQueue,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now();
    const sydneyHour = hourInTimezone(now, PLATFORM_TIMEZONE);
    if (sydneyHour >= QUIET_START_HOUR || sydneyHour < QUIET_END_HOUR) {
      this.logger.info({ sydneyHour }, 'inspector_notice.sweep_skipped_quiet_hours');
      return;
    }

    const rows = await this.repo.findUndeliveredForSweep(now, MAX_PER_RUN);
    for (const row of rows) {
      if (row.reason === 'incomplete') {
        this.logger.error(
          { noticeId: row.id, pending: row.pendingCount },
          'inspector_notice.delivery_incomplete',
        );
      }
      await this.jobQueue.enqueue(
        DELIVER_JOB,
        { noticeId: row.id },
        {
          singletonKey: row.id,
          retryLimit: 3,
          retryBackoff: true,
          expireInMinutes: getInspectorNoticeDeliverExpireMinutes(row.recipientCount),
        },
      );
    }

    this.logger.info({ requeued: rows.length }, 'inspector_notice.sweep_completed');
    if (rows.length > 0) {
      this.logger.warn(
        { noticeIds: rows.map((r) => r.id) },
        'inspector_notice.sweep_requeued',
      );
    }
  }
}
