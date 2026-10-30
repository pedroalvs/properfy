import type { Clock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import type { IPushSubscriptionRepository } from '../../domain/push-subscription.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1000;
/** Revoked push subscriptions older than this are purged (L-F02-06). */
export const INSPECTOR_PUSH_SUBSCRIPTION_PURGE_DAYS = 90;

/**
 * Daily retention job (03:45 Sydney, L-F02-06): auto-archive SYSTEM notices older than
 * `retentionDays` (manual notices are never touched) and delete push subscriptions revoked
 * more than 90 days ago. No per-row audit — bulk system operation.
 */
export class AutoArchiveInspectorNoticesUseCase {
  constructor(
    private readonly noticeRepo: IInspectorNoticeRepository,
    private readonly pushSubRepo: IPushSubscriptionRepository,
    private readonly clock: Clock,
    private readonly retentionDays: number,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now();

    const archiveCutoff = new Date(now.getTime() - this.retentionDays * DAY_MS);
    const archived = await this.noticeRepo.autoArchiveSystemOlderThan(archiveCutoff, now, BATCH_SIZE);
    this.logger.info({ count: archived }, 'inspector_notice.auto_archived');

    const purgeCutoff = new Date(now.getTime() - INSPECTOR_PUSH_SUBSCRIPTION_PURGE_DAYS * DAY_MS);
    const purged = await this.pushSubRepo.purgeRevokedBefore(purgeCutoff, BATCH_SIZE);
    this.logger.info({ count: purged }, 'push_subscription.purged');
  }
}
