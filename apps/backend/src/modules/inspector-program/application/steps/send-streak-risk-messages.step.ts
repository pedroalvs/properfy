import { INSPECTOR_CHALLENGES_PATH } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { getCanonicalPeriod } from '../../../billing/domain/billing-period.service';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';
import type { IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import type { IProgramInspectorReader } from '../../domain/program-inspector.reader';
import { computeStreak, isStreakAtRisk } from '../../domain/streak';
import { buildStreakRiskMessage } from '../../domain/program-message-copy';
import type { InspectorProgramStandingService } from '../inspector-program-standing.service';
import type { InspectorProgramDailyStep, InspectorProgramDailyStepContext } from '../use-cases/run-inspector-program-daily.use-case';

type ProgressPort = Pick<InspectorProgramStandingService, 'getActiveGoalProgressForMany'>;

/**
 * Publishes a streak-at-risk notice on the last day of an inspector's streak cycle
 * when they participate in a goal of that cycle and have not met any yet. Progress is
 * read in one batched pass; streaks are per inspector (a light closure read).
 */
export class SendStreakRiskMessagesStep implements InspectorProgramDailyStep {
  readonly name = 'send-streak-risk-messages';
  readonly phase = 'MESSAGES' as const;

  constructor(
    private readonly inspectorReader: IProgramInspectorReader,
    private readonly standingService: ProgressPort,
    private readonly closureRepo: Pick<IGoalPeriodClosureRepository, 'findParticipations'>,
    private readonly publish: PublishSystemInspectorNoticeUseCase,
    private readonly logger?: Logger,
  ) {}

  async run(ctx: InspectorProgramDailyStepContext): Promise<void> {
    try {
      const activeInspectors = await this.inspectorReader.loadActiveInspectors();
      if (activeInspectors.length === 0) return;
      const progressByInspector = await this.standingService.getActiveGoalProgressForMany(
        activeInspectors.map((i) => i.id),
        ctx.now,
      );

      let created = 0;
      let deduped = 0;
      for (const inspector of activeInspectors) {
        try {
          const participations = await this.closureRepo.findParticipations(inspector.id);
          const streak = computeStreak({ today: ctx.today, participations });
          if (streak.cycle === null || streak.count < 1) continue;
          const cyclePeriod = getCanonicalPeriod(streak.cycle, ctx.today);
          const cycleProgress = (progressByInspector.get(inspector.id) ?? []).filter(
            (p) => p.period.type === streak.cycle && p.state !== 'UPCOMING',
          );
          const atRisk = isStreakAtRisk({
            streak: streak.count,
            today: ctx.today,
            currentPeriodEnd: cyclePeriod.periodEnd,
            participatesInCycleGoal: cycleProgress.length > 0,
            achievedSoFar: cycleProgress.some((p) => p.state === 'MET_SO_FAR'),
          });
          if (!atRisk) continue;
          const message = buildStreakRiskMessage({ cycle: streak.cycle, count: streak.count });
          const result = await this.publish.execute({
            type: 'PERFORMANCE_MESSAGE',
            inspectorIds: [inspector.id],
            title: message.title,
            body: message.body,
            dedupeKey: `program-streak-risk:${inspector.id}:${cyclePeriod.periodStart}`,
            targetPath: INSPECTOR_CHALLENGES_PATH,
          });
          if (result.created) created += 1;
          else deduped += 1;
        } catch (error) {
          this.logger?.error({ err: error, inspectorId: inspector.id }, 'inspector_program.streak_publish_failed');
        }
      }
      this.logger?.info({ step: 'streak-risk', created, deduped }, 'inspector_program.messages_sent');
    } catch (error) {
      this.logger?.error({ err: error }, 'inspector_program.streak_step_failed');
    }
  }
}
