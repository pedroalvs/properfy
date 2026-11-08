import type { PrismaClient } from '@prisma/client';
import { resolveInspectorLevel } from '@properfy/shared';
import type { ReliabilityFactsScope } from '../../../reliability/domain/reliability-facts.reader';
import type {
  CurrentIndex,
  ReliabilityIndexReader,
} from '../../../reliability/application/reliability-index.reader';
import type {
  ReliabilityComputationBatch,
  ReliabilityMetricsService,
} from '../../../reliability/application/reliability-metrics.service';
import type { AuditService } from '../../../../shared/domain/audit';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { evaluateGoal } from '../../domain/evaluate-goal';
import type { GoalWithScope, IGoalRepository } from '../../domain/goal.repository';
import {
  countPeriodsToClose,
  goalPeriodsToClose,
  goalTermsForPeriod,
} from '../../domain/goal-periods';
import type { BillingPeriod } from '../../../billing/domain/billing-period.service';
import type { IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import { resolveParticipants } from '../../domain/participants';
import { scopeLabelFor } from '../../domain/scope-label';
import type { IProgramInspectorReader } from '../../domain/program-inspector.reader';
import type { IRewardAwardRepository, RewardAwardInsert } from '../../domain/reward-award.repository';
import type { InspectorProgramDailyStep, InspectorProgramDailyStepContext } from './run-inspector-program-daily.use-case';

type MetricsPort = Pick<ReliabilityMetricsService, 'computeAll'>;
type IndexReaderPort = Pick<ReliabilityIndexReader, 'getCurrentIndexes'>;

function scopeKey(goal: GoalWithScope): string {
  if (goal.metric === 'REGION_VOLUME') return `region:${goal.scopeRegionId}`;
  if (goal.metric === 'SERVICE_TYPE_VOLUME') return `type:${goal.scopeServiceTypeId}`;
  return 'none';
}

function scopeOf(goal: GoalWithScope): ReliabilityFactsScope | undefined {
  if (goal.metric === 'REGION_VOLUME' && goal.scopeRegionId) return { regionId: goal.scopeRegionId };
  if (goal.metric === 'SERVICE_TYPE_VOLUME' && goal.scopeServiceTypeId) return { serviceTypeId: goal.scopeServiceTypeId };
  return undefined;
}

/**
 * Closes each ended, unclosed goal period (Algorithm B): evaluates the
 * participants with the F07 engine, creates idempotent `PENDING` awards with an
 * immutable snapshot, and promotes any due `next_*` terms (L-F08-02). It is the
 * COMPUTE step of the daily job; the message run is enqueued by a sibling step.
 * DR2: it never waits for today's F07 snapshot — it uses the latest ≤ today,
 * stores it, and logs a stale warning rather than delaying rewards.
 */
export class CloseGoalPeriodsUseCase implements InspectorProgramDailyStep {
  readonly name = 'close-goal-periods';
  readonly phase = 'COMPUTE' as const;

  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly closureRepo: IGoalPeriodClosureRepository,
    private readonly rewardRepo: IRewardAwardRepository,
    private readonly inspectorReader: IProgramInspectorReader,
    private readonly metricsService: MetricsPort,
    private readonly indexReader: IndexReaderPort,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
    private readonly prisma?: PrismaClient,
  ) {}

  async run(ctx: InspectorProgramDailyStepContext): Promise<void> {
    const { now, today } = ctx;
    const startedAt = Date.now();
    const closureTrigger: 'SCHEDULED' | 'STARTUP' = ctx.trigger === 'STARTUP' ? 'STARTUP' : 'SCHEDULED';

    const goals = await this.goalRepo.findActive();
    const closedStarts = await this.closureRepo.findStartsByGoalIds(goals.map((g) => g.id));

    const pending: Array<{ goal: GoalWithScope; period: BillingPeriod }> = [];
    const cappedGoalIds = new Set<string>();
    for (const goal of goals) {
      const starts = closedStarts.get(goal.id) ?? new Set<string>();
      const toClose = goalPeriodsToClose(goal, today, starts);
      if (countPeriodsToClose(goal, today, starts) > toClose.length) {
        cappedGoalIds.add(goal.id);
        this.logger.warn(
          { goalId: goal.id, cap: toClose.length },
          'inspector_program.close_catch_up_capped',
        );
      }
      for (const period of toClose) pending.push({ goal, period });
    }

    const promotable = goals.filter(
      (g) => g.nextEffectiveFrom !== null && today >= g.nextEffectiveFrom && !cappedGoalIds.has(g.id),
    );

    if (pending.length === 0 && promotable.length === 0) {
      this.logInfo(ctx.trigger, goals.length, 0, 0, 0, startedAt);
      return;
    }

    const [programSettings, reliabilityIndex] = await Promise.all([
      this.settingsReader.get('inspectorProgram'),
      this.settingsReader.get('reliabilityIndex'),
    ]);

    const participantsByGoalId = new Map<string, string[]>();
    const batchByKey = new Map<string, ReliabilityComputationBatch>();
    const indexByInspector = new Map<string, CurrentIndex>();
    let runSnapshotDate: string | null = null;

    if (pending.length > 0) {
      const inspectors = await this.inspectorReader.loadActiveInspectors();
      const regionIds = [
        ...new Set(pending.map((p) => p.goal.scopeRegionId).filter((x): x is string => x !== null)),
      ];
      const regionLinks = await this.inspectorReader.loadRegionInspectorIds(regionIds);

      const pendingGoals = [...new Map(pending.map((p) => [p.goal.id, p.goal])).values()];
      for (const goal of pendingGoals) {
        const regionSet = goal.scopeRegionId
          ? (regionLinks.get(goal.scopeRegionId) ?? new Set<string>())
          : new Set<string>();
        participantsByGoalId.set(goal.id, resolveParticipants(goal, inspectors, regionSet));
      }

      const groups = new Map<
        string,
        { periodStart: string; periodEnd: string; scope?: ReliabilityFactsScope; ids: Set<string> }
      >();
      for (const { goal, period } of pending) {
        const key = `${period.periodStart}|${period.periodEnd}|${scopeKey(goal)}`;
        const group =
          groups.get(key) ??
          { periodStart: period.periodStart, periodEnd: period.periodEnd, scope: scopeOf(goal), ids: new Set<string>() };
        for (const id of participantsByGoalId.get(goal.id) ?? []) group.ids.add(id);
        groups.set(key, group);
      }
      for (const [key, group] of groups) {
        batchByKey.set(
          key,
          await this.metricsService.computeAll(group.periodStart, group.periodEnd, [...group.ids], group.scope),
        );
      }

      const allIds = [...new Set([...participantsByGoalId.values()].flat())];
      const indexes = await this.indexReader.getCurrentIndexes(allIds);
      for (const idx of indexes) indexByInspector.set(idx.inspectorId, idx);
      runSnapshotDate = indexes.find((i) => i.snapshotDate !== null)?.snapshotDate ?? null;
      if (runSnapshotDate !== null && runSnapshotDate < today) {
        this.logger.warn({ snapshotDate: runSnapshotDate, today }, 'inspector_program.index_snapshot_stale');
      }
    }

    let awardsCreated = 0;
    let periodsClosed = 0;
    let skipped = 0;

    for (const { goal, period } of pending) {
      const terms = goalTermsForPeriod(goal, period.periodStart);
      const participantIds = participantsByGoalId.get(goal.id) ?? [];
      const batch = batchByKey.get(`${period.periodStart}|${period.periodEnd}|${scopeKey(goal)}`);
      const scopeLabel = scopeLabelFor(goal);

      const achievers = participantIds
        .map((inspectorId) => ({
          inspectorId,
          evaluation: evaluateGoal(goal, batch?.byInspector.get(inspectorId), {
            reliabilityIndex,
            periodEnd: period.periodEnd,
          }),
        }))
        .filter((r) => r.evaluation.achieved);

      await runInTransaction(this.prisma, async ({ tx, defer }) => {
        const { count } = await this.closureRepo.insertManySkipDuplicates(
          [
            {
              goalId: goal.id,
              periodType: goal.period,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              participantIds,
              participantsCount: participantIds.length,
              achieversCount: achievers.length,
              promisedAmount: terms.rewardAmount * participantIds.length,
              scopeLabel,
              indexSnapshotDate: runSnapshotDate,
              trigger: closureTrigger,
              closedAt: now,
            },
          ],
          tx,
        );
        if (count === 0) {
          skipped += 1;
          return; // already closed — idempotent re-run
        }
        periodsClosed += 1;

        const awardInserts: RewardAwardInsert[] = achievers.map(({ inspectorId, evaluation }) => {
          const score = indexByInspector.get(inspectorId)?.score ?? null;
          return {
            goalId: goal.id,
            inspectorId,
            periodType: goal.period,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            goalTitle: goal.title,
            metric: goal.metric,
            comparator: goal.comparator,
            target: terms.target,
            amount: terms.rewardAmount,
            scopeLabel,
            achievedValue: evaluation.value ?? 0,
            serviceCount: evaluation.serviceCount,
            achievedOn: evaluation.achievedOn ?? period.periodEnd,
            indexScoreAtClose: score,
            levelAtClose: resolveInspectorLevel(score, programSettings.levels),
            indexSnapshotDate: runSnapshotDate,
          };
        });
        await this.rewardRepo.insertManySkipDuplicates(awardInserts, tx);
        const created = await this.rewardRepo.findByGoalPeriod(goal.id, period.periodStart, tx);
        ctx.createdAwardIds.push(...created.map((a) => a.id));
        awardsCreated += created.length;

        defer(async () => {
          this.auditService.log({
            action: 'goal_period.closed',
            actorType: 'SYSTEM',
            entityType: 'InspectorGoal',
            entityId: goal.id,
            tenantId: null,
            metadata: {
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              participants: participantIds.length,
              achievers: achievers.length,
            },
          });
          for (const award of created) {
            this.auditService.log({
              action: 'reward_award.created',
              actorType: 'SYSTEM',
              entityType: 'RewardAward',
              entityId: award.id,
              tenantId: null,
              after: award,
            });
          }
        });
      });
    }

    for (const goal of promotable) {
      const target = goal.nextTarget ?? goal.target;
      const rewardAmount = goal.nextRewardAmount ?? goal.rewardAmount;
      await runInTransaction(this.prisma, async ({ tx, defer }) => {
        await this.goalRepo.promoteNextTerms(goal.id, { target, rewardAmount }, tx);
        defer(async () => {
          this.auditService.log({
            action: 'inspector_goal.terms_applied',
            actorType: 'SYSTEM',
            entityType: 'InspectorGoal',
            entityId: goal.id,
            tenantId: null,
            before: { target: goal.target, rewardAmount: goal.rewardAmount },
            after: { target, rewardAmount },
          });
        });
      });
    }

    this.logInfo(ctx.trigger, goals.length, periodsClosed, awardsCreated, skipped, startedAt);
  }

  private logInfo(
    trigger: string,
    goals: number,
    periods: number,
    awardsCreated: number,
    skipped: number,
    startedAt: number,
  ): void {
    this.logger.info(
      { trigger, goals, periods, awardsCreated, skipped, durationMs: Date.now() - startedAt },
      'inspector_program.periods_closed',
    );
  }
}
