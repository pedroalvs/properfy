import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { snapshotDateFor } from '../../domain/snapshot-window';

/** Minutes after a weight save before an un-run recompute is "overdue" (L-F07-10). */
export const RECOMPUTE_OVERDUE_MINUTES = 15;

export type EnsureTodayOutcome = 'ENQUEUED_MISSING' | 'ENQUEUED_OVERDUE' | 'PENDING' | 'UP_TO_DATE';

const RECOMPUTE_JOB_OPTIONS = { retryLimit: 3, retryBackoff: true, expireInMinutes: 15 } as const;

export interface EnsureTodaySnapshotInput {
  now?: Date;
}

/**
 * Backfill + reinforcement for today's reliability snapshot (L-F07-02 / L-F07-10).
 * Runs on boot and hourly 05:00–12:00 Sydney: enqueues a BACKFILL when today has
 * no snapshot, or a SETTINGS_CHANGED recompute (with a `reliability.recompute_overdue`
 * error log) when the weights were saved more than 15 minutes ago and the snapshot
 * still predates the save. Idempotency is by the row's existence + the compute lock,
 * so two concurrent calls are safe.
 */
export class EnsureTodaySnapshotUseCase {
  constructor(
    private readonly jobQueue: IJobQueue,
    private readonly findTodayComputedAt: (snapshotDate: string) => Promise<Date | null>,
    private readonly findSettingsUpdatedAt: () => Promise<Date | null>,
    private readonly logger: Logger,
  ) {}

  async execute(input: EnsureTodaySnapshotInput = {}): Promise<EnsureTodayOutcome> {
    const now = input.now ?? new Date();
    const snapshotDate = snapshotDateFor(now);

    const computedAt = await this.findTodayComputedAt(snapshotDate);
    if (computedAt === null) {
      await this.jobQueue.enqueue('reliability.compute-snapshots', { trigger: 'BACKFILL' }, RECOMPUTE_JOB_OPTIONS);
      return 'ENQUEUED_MISSING';
    }

    const settingsUpdatedAt = await this.findSettingsUpdatedAt();
    const recomputePending = settingsUpdatedAt !== null && settingsUpdatedAt.getTime() > computedAt.getTime();
    if (!recomputePending) return 'UP_TO_DATE';

    const minutesSinceSave = (now.getTime() - settingsUpdatedAt!.getTime()) / 60_000;
    if (minutesSinceSave <= RECOMPUTE_OVERDUE_MINUTES) return 'PENDING';

    this.logger.error(
      { settingsUpdatedAt: settingsUpdatedAt!.toISOString(), computedAt: computedAt.toISOString() },
      'reliability.recompute_overdue',
    );
    await this.jobQueue.enqueue('reliability.compute-snapshots', { trigger: 'SETTINGS_CHANGED' }, RECOMPUTE_JOB_OPTIONS);
    return 'ENQUEUED_OVERDUE';
  }
}
