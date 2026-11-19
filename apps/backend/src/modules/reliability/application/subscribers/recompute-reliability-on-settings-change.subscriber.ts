import type { DomainEvent } from '../../../../shared/application/events/domain-event-bus';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * Delay before the recompute runs. Covers the F03 `PlatformSettingsService` 30 s
 * per-instance cache TTL plus a 5 s margin, so a worker on another machine reads
 * the new weights. If that TTL changes, change this with it.
 */
export const SETTINGS_RECOMPUTE_DELAY_SECONDS = 35;

const RELIABILITY_INDEX_KEY = 'reliabilityIndex';

/**
 * Recomputes today's reliability snapshot when the `reliabilityIndex` weights are
 * saved (03.A1). Subscribes to the F03 `platform_setting.updated.v1` event (never
 * edits the F03 use case). Only the weights key triggers a recompute; other keys
 * (`fieldEvents`, `routeWeights`, …) wait for the next daily run. No `singletonKey`
 * (it would drop a save landing during the daily job); the delay + advisory lock
 * serialize the runs instead. An enqueue failure is logged, never thrown (the save
 * already committed; the hourly ensure-today corrects a missed recompute).
 */
export class RecomputeReliabilityOnSettingsChangeSubscriber {
  constructor(
    private readonly jobQueue: IJobQueue,
    private readonly logger: Logger,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    if (event.payload.key !== RELIABILITY_INDEX_KEY) return;

    const startAfter = new Date(event.occurredAt.getTime() + SETTINGS_RECOMPUTE_DELAY_SECONDS * 1000);
    try {
      await this.jobQueue.enqueue(
        'reliability.compute-snapshots',
        { trigger: 'SETTINGS_CHANGED' },
        { startAfter, retryLimit: 3, retryBackoff: true, expireInMinutes: 15 },
      );
    } catch (err) {
      this.logger.error({ err }, 'reliability.recompute_enqueue_failed');
    }
  };
}
