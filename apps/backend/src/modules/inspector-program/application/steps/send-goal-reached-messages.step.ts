import { INSPECTOR_CHALLENGES_PATH } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';
import type { IProgramInspectorReader } from '../../domain/program-inspector.reader';
import type { IRecentRewardAwardReader } from '../../domain/recent-awards.reader';
import { buildGoalReachedMessage } from '../../domain/program-message-copy';
import { groupGoalReachedAwards } from '../program-messages';
import type { InspectorProgramDailyStep, InspectorProgramDailyStepContext } from '../use-cases/run-inspector-program-daily.use-case';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * Publishes one "goal reached" notice per `(inspector, periodEnd)` for non-void
 * awards created in the last 48 h (L-F08-01). The 48 h scan — not `ctx.createdAwardIds`,
 * which belongs to the 04:45 compute run — makes a failed previous run recover the next
 * day idempotently (the dedupe key is per inspector and period end).
 */
export class SendGoalReachedMessagesStep implements InspectorProgramDailyStep {
  readonly name = 'send-goal-reached-messages';
  readonly phase = 'MESSAGES' as const;

  constructor(
    private readonly recentAwards: IRecentRewardAwardReader,
    private readonly inspectorReader: IProgramInspectorReader,
    private readonly publish: PublishSystemInspectorNoticeUseCase,
    private readonly logger?: Logger,
  ) {}

  async run(ctx: InspectorProgramDailyStepContext): Promise<void> {
    try {
      const since = new Date(ctx.now.getTime() - FORTY_EIGHT_HOURS_MS);
      const [awards, activeInspectors] = await Promise.all([
        this.recentAwards.findRecentNonVoidByCreatedAt(since),
        this.inspectorReader.loadActiveInspectors(),
      ]);
      const activeIds = new Set(activeInspectors.map((i) => i.id));
      const groups = groupGoalReachedAwards(awards, activeIds);

      let created = 0;
      let deduped = 0;
      for (const group of groups) {
        try {
          const message = buildGoalReachedMessage(
            group.awards.map((a) => ({
              goalTitle: a.goalTitle,
              amount: a.amount,
              periodType: a.periodType,
              periodStart: a.periodStart,
            })),
          );
          const result = await this.publish.execute({
            type: 'PERFORMANCE_MESSAGE',
            inspectorIds: [group.inspectorId],
            title: message.title,
            body: message.body,
            dedupeKey: `program-goals-reached:${group.inspectorId}:${group.periodEnd}`,
            targetPath: INSPECTOR_CHALLENGES_PATH,
          });
          if (result.created) created += 1;
          else deduped += 1;
        } catch (error) {
          this.logger?.error({ err: error, inspectorId: group.inspectorId }, 'inspector_program.goal_reached_publish_failed');
        }
      }
      this.logger?.info({ step: 'goal-reached', created, deduped, groups: groups.length }, 'inspector_program.messages_sent');
    } catch (error) {
      this.logger?.error({ err: error }, 'inspector_program.goal_reached_step_failed');
    }
  }
}
