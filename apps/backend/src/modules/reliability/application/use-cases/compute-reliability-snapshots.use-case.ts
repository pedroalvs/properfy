import type { Prisma } from '@prisma/client';
import { RELIABILITY_METRIC_KEYS, RELIABILITY_WINDOW_DAYS, addCivilDays } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { computeMetricFromFacts, type MetricContext } from '../../domain/metrics';
import { computeReliabilityScore } from '../../domain/score';
import { snapshotDateFor, snapshotWindow } from '../../domain/snapshot-window';
import { RELIABILITY_SNAPSHOT_RETENTION_DAYS } from '../../domain/snapshot-retention';
import type { NewReliabilitySnapshotRow, SnapshotSettings, SnapshotTrigger } from '../../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository } from '../../domain/reliability-snapshot.repository';
import type { ReliabilityComputationBatch, ReliabilitySettingsInput } from '../reliability-metrics.service';

/** The one method of the F07-1 metrics service this job consumes. */
export interface ReliabilityBatchComputer {
  computeAllWith(
    tx: Prisma.TransactionClient,
    from: string,
    to: string,
    settings: ReliabilitySettingsInput,
  ): Promise<ReliabilityComputationBatch>;
}

export interface ComputeReliabilitySnapshotsInput {
  trigger: SnapshotTrigger;
  /** Injectable clock. */
  now?: Date;
  /** Attempt number for the failure log (`job.retryCount + 1`); defaults to 1. */
  attempt?: number;
}

export interface ComputeReliabilitySnapshotsResult {
  snapshotDate: string;
  inspectors: number;
  scored: number;
  insufficient: number;
  durationMs: number;
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    // Prisma interactive-transaction timeout surfaces as P2028.
    if ((error as { code?: string }).code === 'P2028' || /timeout/i.test(error.message)) return 'TIMEOUT';
    return String(error);
  }
  return String(error);
}

/**
 * Computes the daily reliability snapshot for every non-deleted inspector in one
 * pass, serialized by a transaction advisory lock and idempotent per day (the
 * day's rows are replaced atomically). Only a `SCHEDULED` run purges old /
 * deleted-inspector rows. Any failure logs `reliability.snapshots_failed` and
 * rethrows so pg-boss retries (L-F07-02).
 */
export class ComputeReliabilitySnapshotsUseCase {
  constructor(
    private readonly repo: IReliabilitySnapshotRepository,
    private readonly metricsService: ReliabilityBatchComputer,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly logger: Logger,
  ) {}

  async execute(input: ComputeReliabilitySnapshotsInput): Promise<ComputeReliabilitySnapshotsResult> {
    const now = input.now ?? new Date();
    const snapshotDate = snapshotDateFor(now);
    const { from, to } = snapshotWindow(snapshotDate);
    const startedAt = Date.now();

    try {
      const outcome = await this.repo.withComputeTransaction(async (tx) => {
        // Serialize first, then read settings — so a concurrent run and a weight
        // save never interleave their read-then-write (D1/D2).
        await this.repo.acquireComputeLock(tx);

        const [reliabilityIndex, fieldEvents] = await Promise.all([
          this.settingsReader.get('reliabilityIndex'),
          this.settingsReader.get('fieldEvents'),
        ]);
        const settings: ReliabilitySettingsInput = {
          reliabilityIndex,
          toleranceMinutes: fieldEvents.checkInWindowToleranceMinutes,
        };

        const inspectorIds = await this.repo.listNonDeletedInspectorIds(tx);
        const batch = await this.metricsService.computeAllWith(tx, from, to, settings);

        const ctx: MetricContext = {
          toleranceMinutes: settings.toleranceMinutes,
          volumeReference: batch.volumeReference.value,
          minimumRatings: reliabilityIndex.minimumRatings,
          from,
          to,
        };
        const settingsJson: SnapshotSettings = {
          weights: reliabilityIndex.weights,
          minimumVolume: reliabilityIndex.minimumVolume,
          minimumRatings: reliabilityIndex.minimumRatings,
          toleranceMinutes: settings.toleranceMinutes,
          volumeReference: batch.volumeReference,
        };

        let scored = 0;
        const rows: NewReliabilitySnapshotRow[] = inspectorIds.map((inspectorId) => {
          const computed = batch.byInspector.get(inspectorId);
          // Inspectors with no facts in the window are not in the batch; synthesize
          // an empty result (all metrics null except VOLUME rate 0, same reference).
          const metrics = computed
            ? computed.metrics
            : RELIABILITY_METRIC_KEYS.map((metric) => computeMetricFromFacts(metric, [], ctx));
          const volume = computed?.volume ?? 0;
          const completedCount = computed?.completedCount ?? 0;
          const { status, score } = computeReliabilityScore(metrics, reliabilityIndex, volume);
          if (status === 'SCORED') scored += 1;
          return {
            inspectorId,
            snapshotDate,
            windowFrom: from,
            windowTo: to,
            windowDays: RELIABILITY_WINDOW_DAYS,
            status,
            score,
            volume,
            completedCount,
            metrics,
            settings: settingsJson,
            trigger: input.trigger,
            computedAt: now,
          };
        });

        await this.repo.replaceForDate(tx, snapshotDate, rows);

        const purged =
          input.trigger === 'SCHEDULED'
            ? await this.repo.purgeOlderThanAndDeleted(
                tx,
                addCivilDays(snapshotDate, -RELIABILITY_SNAPSHOT_RETENTION_DAYS),
              )
            : null;

        return { inspectors: rows.length, scored, insufficient: rows.length - scored, purged };
      });

      const durationMs = Date.now() - startedAt;
      this.logger.info(
        {
          snapshotDate,
          trigger: input.trigger,
          inspectors: outcome.inspectors,
          scored: outcome.scored,
          insufficient: outcome.insufficient,
          durationMs,
        },
        'reliability.snapshots_computed',
      );
      if (outcome.purged && (outcome.purged.count > 0 || outcome.purged.deletedInspectors > 0)) {
        this.logger.info(
          { snapshotDate, count: outcome.purged.count, deletedInspectors: outcome.purged.deletedInspectors },
          'reliability.snapshots_purged',
        );
      }

      return {
        snapshotDate,
        inspectors: outcome.inspectors,
        scored: outcome.scored,
        insufficient: outcome.insufficient,
        durationMs,
      };
    } catch (error) {
      this.logger.error(
        { snapshotDate, trigger: input.trigger, reason: failureReason(error), attempt: input.attempt ?? 1 },
        'reliability.snapshots_failed',
      );
      throw error;
    }
  }
}
