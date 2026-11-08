import type { AuthContext, BillingPeriodType, GoalMetric } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { getCanonicalPeriod, isCycleAligned } from '../../../billing/domain/billing-period.service';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { ValidationError } from '../../../../shared/domain/errors';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { CivilDate } from '../../domain/goal.entity';
import { goalTermsForPeriod } from '../../domain/goal-periods';
import type { IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import type { IGoalRepository } from '../../domain/goal.repository';
import { resolveParticipants } from '../../domain/participants';
import type { IProgramInspectorReader } from '../../domain/program-inspector.reader';
import { summarizePeriod, type PeriodTotals } from '../../domain/promised-summary';
import type { IRewardAwardRepository } from '../../domain/reward-award.repository';

export type ProgramPeriodStatus = 'CLOSED' | 'IN_PROGRESS' | 'UPCOMING';

export interface ProgramPeriodSummaryGoal {
  goalId: string;
  title: string;
  metric: GoalMetric;
  rewardAmount: number;
  participants: number;
  promised: number;
  achievers: number;
  achievedAmount: number;
  closed: boolean;
  skipped: boolean;
}

export interface ProgramPeriodSummary {
  periodType: BillingPeriodType;
  periodStart: CivilDate;
  periodEnd: CivilDate;
  status: ProgramPeriodStatus;
  totals: PeriodTotals;
  goals: ProgramPeriodSummaryGoal[];
}

/**
 * Promised-vs-achieved summary for one period (03.13). A closed period reports its
 * `GoalPeriodClosure`s; an in-progress/upcoming period reports the active goals
 * that run in it with their current participants and no awards yet.
 */
export class GetProgramPeriodSummaryUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly closureRepo: IGoalPeriodClosureRepository,
    private readonly rewardRepo: IRewardAwardRepository,
    private readonly inspectorReader: IProgramInspectorReader,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthContext,
    input: { periodType: BillingPeriodType; periodStart: CivilDate },
  ): Promise<ProgramPeriodSummary> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      entityType: 'InspectorGoal',
      action: 'inspector_program.awards.view',
    });

    const period = getCanonicalPeriod(input.periodType, input.periodStart);
    if (!isCycleAligned(input.periodType, input.periodStart, period.periodEnd)) {
      throw new ValidationError('Start on the first day of a period');
    }

    const today = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    const status: ProgramPeriodStatus =
      period.periodEnd < today ? 'CLOSED' : input.periodStart > today ? 'UPCOMING' : 'IN_PROGRESS';

    const [closures, awards] = await Promise.all([
      this.closureRepo.findByPeriod(input.periodType, input.periodStart),
      this.rewardRepo.findByPeriod(input.periodType, input.periodStart),
    ]);

    if (closures.length > 0) {
      const goals = await this.goalRepo.findByIds(closures.map((c) => c.goalId));
      const goalById = new Map(goals.map((g) => [g.id, g]));
      const nonVoidByGoal = new Map<string, number>();
      for (const award of awards) {
        if (award.status === 'VOID') continue;
        nonVoidByGoal.set(award.goalId, (nonVoidByGoal.get(award.goalId) ?? 0) + award.amount);
      }
      const summaryGoals: ProgramPeriodSummaryGoal[] = closures.map((c) => {
        const goal = goalById.get(c.goalId);
        const terms = goal ? goalTermsForPeriod(goal, input.periodStart) : null;
        return {
          goalId: c.goalId,
          title: goal?.title ?? '',
          metric: goal?.metric ?? 'VOLUME',
          rewardAmount: terms?.rewardAmount ?? 0,
          participants: c.participantsCount,
          promised: c.promisedAmount,
          achievers: c.achieversCount,
          achievedAmount: nonVoidByGoal.get(c.goalId) ?? 0,
          closed: true,
          skipped: c.trigger === 'SKIPPED_INACTIVE',
        };
      });
      const totals = summarizePeriod(
        closures.map((c) => ({ rewardAmount: c.promisedAmount, participants: 1 })),
        awards.map((a) => ({ status: a.status, amount: a.amount })),
      );
      return { periodType: input.periodType, periodStart: input.periodStart, periodEnd: period.periodEnd, status, totals, goals: summaryGoals };
    }

    // No closures yet: report the active goals that run in this period.
    const activeGoals = (await this.goalRepo.findActive()).filter(
      (g) =>
        g.period === input.periodType &&
        g.startsAt <= input.periodStart &&
        (g.endsAt === null || period.periodEnd <= g.endsAt),
    );
    const inspectors = await this.inspectorReader.loadActiveInspectors();
    const regionIds = [...new Set(activeGoals.map((g) => g.scopeRegionId).filter((x): x is string => x !== null))];
    const regionLinks = await this.inspectorReader.loadRegionInspectorIds(regionIds);

    const summaryGoals: ProgramPeriodSummaryGoal[] = activeGoals.map((goal) => {
      const regionSet = goal.scopeRegionId ? (regionLinks.get(goal.scopeRegionId) ?? new Set<string>()) : new Set<string>();
      const participants = resolveParticipants(goal, inspectors, regionSet).length;
      const terms = goalTermsForPeriod(goal, input.periodStart);
      return {
        goalId: goal.id,
        title: goal.title,
        metric: goal.metric,
        rewardAmount: terms.rewardAmount,
        participants,
        promised: terms.rewardAmount * participants,
        achievers: 0,
        achievedAmount: 0,
        closed: false,
        skipped: false,
      };
    });
    const totals = summarizePeriod(
      summaryGoals.map((g) => ({ rewardAmount: g.rewardAmount, participants: g.participants })),
      [],
    );
    return { periodType: input.periodType, periodStart: input.periodStart, periodEnd: period.periodEnd, status, totals, goals: summaryGoals };
  }
}
