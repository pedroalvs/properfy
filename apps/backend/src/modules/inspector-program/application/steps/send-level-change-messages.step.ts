import { INSPECTOR_CHALLENGES_PATH, addCivilDays, resolveInspectorLevel } from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IReliabilitySnapshotRepository } from '../../../reliability/domain/reliability-snapshot.repository';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';
import type { IRecentProgramNoticeReader } from '../../domain/recent-program-notice.reader';
import { buildLevelChangeMessage } from '../../domain/program-message-copy';
import { computeWeightsVersion } from '../program-messages';
import type { InspectorProgramDailyStep, InspectorProgramDailyStepContext } from '../use-cases/run-inspector-program-daily.use-case';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Publishes a level-change notice for each inspector whose level moved between the
 * previous and the latest snapshot (L-F08-06, DR4). Skips entirely when the latest
 * snapshot is not today's, or when the index tuning changed between the two days
 * (the move came from a recompute, not the inspector). Suppresses an inspector who
 * already got a level notice within the last 7 days (strictly — a gap of exactly 7
 * days may send). Reads only `findLatestSnapshotDate` + `findRowsByDate`.
 */
export class SendLevelChangeMessagesStep implements InspectorProgramDailyStep {
  readonly name = 'send-level-change-messages';
  readonly phase = 'MESSAGES' as const;

  constructor(
    private readonly snapshotRepo: Pick<IReliabilitySnapshotRepository, 'findLatestSnapshotDate' | 'findRowsByDate'>,
    private readonly settings: IPlatformSettingsReader,
    private readonly recentNotices: IRecentProgramNoticeReader,
    private readonly publish: PublishSystemInspectorNoticeUseCase,
    private readonly logger?: Logger,
  ) {}

  async run(ctx: InspectorProgramDailyStepContext): Promise<void> {
    try {
      const latest = await this.snapshotRepo.findLatestSnapshotDate();
      if (latest === null || latest !== ctx.today) {
        this.logger?.warn({ latest, today: ctx.today }, 'inspector_program.level_snapshot_stale');
        return;
      }
      const [latestRows, prevRows] = await Promise.all([
        this.snapshotRepo.findRowsByDate(latest),
        this.snapshotRepo.findRowsByDate(addCivilDays(latest, -1)),
      ]);
      if (latestRows.length === 0 || prevRows.length === 0) return;

      if (computeWeightsVersion(latestRows[0]!.settings) !== computeWeightsVersion(prevRows[0]!.settings)) {
        this.logger?.info({ reason: 'WEIGHTS_CHANGED' }, 'inspector_program.level_messages_skipped');
        return;
      }

      const thresholds = (await this.settings.get('inspectorProgram')).levels;
      const prevById = new Map(prevRows.map((r) => [r.inspectorId, r]));
      const since = new Date(ctx.now.getTime() - SEVEN_DAYS_MS + 1);

      let created = 0;
      let deduped = 0;
      let skippedRecent = 0;
      for (const row of latestRows) {
        if (!row.inspectorActive || row.score === null) continue;
        const prev = prevById.get(row.inspectorId);
        if (!prev || prev.score === null) continue;
        const newLevel = resolveInspectorLevel(row.score, thresholds);
        const prevLevel = resolveInspectorLevel(prev.score, thresholds);
        if (newLevel === null || prevLevel === null || newLevel === prevLevel) continue;
        try {
          if (await this.recentNotices.hasRecentNotice(`program-level:${row.inspectorId}:`, since)) {
            this.logger?.info({ reason: 'RECENT_MESSAGE', inspectorId: row.inspectorId }, 'inspector_program.level_messages_skipped');
            skippedRecent += 1;
            continue;
          }
          const message = buildLevelChangeMessage({ newLevel, prevLevel, score: row.score, thresholds });
          const result = await this.publish.execute({
            type: 'PERFORMANCE_MESSAGE',
            inspectorIds: [row.inspectorId],
            title: message.title,
            body: message.body,
            dedupeKey: `program-level:${row.inspectorId}:${latest}`,
            targetPath: INSPECTOR_CHALLENGES_PATH,
          });
          if (result.created) created += 1;
          else deduped += 1;
        } catch (error) {
          this.logger?.error({ err: error, inspectorId: row.inspectorId }, 'inspector_program.level_publish_failed');
        }
      }
      this.logger?.info({ step: 'level-change', created, deduped, skippedRecent }, 'inspector_program.messages_sent');
    } catch (error) {
      this.logger?.error({ err: error }, 'inspector_program.level_step_failed');
    }
  }
}
