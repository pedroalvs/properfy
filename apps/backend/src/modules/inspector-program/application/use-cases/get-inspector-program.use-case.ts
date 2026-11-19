import {
  GOAL_METRIC_KIND,
  GOAL_RATE_MINIMUM_VOLUME,
  describeGoal,
  type InspectorProgramResponse,
} from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Clock } from '../../../../shared/domain/clock';
import type { ReliabilityIndexReader } from '../../../reliability/application/reliability-index.reader';
import type { IRecentRewardAwardReader } from '../../domain/recent-awards.reader';
import { buildAnonymousRanking } from '../../domain/ranking-anonymiser';
import type { InspectorProgramStandingService } from '../inspector-program-standing.service';

type StandingPort = Pick<InspectorProgramStandingService, 'getStanding' | 'getActiveGoalProgress'>;
type IndexReaderPort = Pick<ReliabilityIndexReader, 'getCurrentIndexes'>;

/**
 * Assembles the inspector-facing program (GET /v1/inspector/program): the caller's
 * own standing, active-goal progress, reward history and the anonymous platform
 * ranking (03.A3). Read-only; no write occurs here. Civil dates come from the
 * standing service in `PLATFORM_TIMEZONE`; instants are serialised to UTC ISO.
 */
export class GetInspectorProgramUseCase {
  constructor(
    private readonly standing: StandingPort,
    private readonly indexReader: IndexReaderPort,
    private readonly recentAwards: IRecentRewardAwardReader,
    private readonly settings: IPlatformSettingsReader,
    private readonly clock: Clock,
  ) {}

  async execute(input: { inspectorId: string }): Promise<InspectorProgramResponse> {
    const { inspectorId } = input;
    const now = this.clock.now();

    const [standing, progress, indexes, awards, programSettings] = await Promise.all([
      this.standing.getStanding(inspectorId, now),
      this.standing.getActiveGoalProgress(inspectorId, now),
      this.indexReader.getCurrentIndexes(),
      this.recentAwards.findRecentByInspector(inspectorId, 50),
      this.settings.get('inspectorProgram'),
    ]);

    const snapshotDate =
      indexes.find((i) => i.snapshotDate !== null)?.snapshotDate ?? standing.index.snapshotDate ?? null;

    const ranking = buildAnonymousRanking({
      indexes,
      selfInspectorId: inspectorId,
      thresholds: programSettings.levels,
      snapshotDate,
    });

    const activeGoals = progress.map((p) => ({
      goalId: p.goalId,
      title: p.title,
      description: describeGoal({ metric: p.metric, target: p.target, scopeLabel: p.scopeLabel }),
      metric: p.metric,
      comparator: p.comparator,
      target: p.target,
      periodType: p.period.type,
      periodStart: p.period.start,
      periodEnd: p.period.end,
      daysLeft: p.daysLeft,
      rewardAmount: p.rewardAmount,
      value: p.value,
      serviceCount: p.serviceCount,
      minimumServices: GOAL_METRIC_KIND[p.metric] === 'RATE' ? GOAL_RATE_MINIMUM_VOLUME : null,
      state: p.state,
      startsOn: p.state === 'UPCOMING' ? p.period.start : null,
      countsSince: p.countsSince,
    }));

    const openCashTotal = progress
      .filter((p) => p.state !== 'UPCOMING')
      .reduce((sum, p) => sum + p.rewardAmount, 0);

    const mappedAwards = awards.map((a) => ({
      goalTitle: a.goalTitle,
      metric: a.metric,
      periodType: a.periodType,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
      amount: a.amount,
      achievedValue: a.achievedValue,
      status: a.status,
      paidAt: a.paidAt ? a.paidAt.toISOString() : null,
      voidedAt: a.voidedAt ? a.voidedAt.toISOString() : null,
      inspectorNote: a.inspectorNote,
    }));

    return {
      generatedAt: now.toISOString(),
      timezone: 'Australia/Sydney',
      summary: { openCashTotal, currency: 'AUD' },
      activeGoals,
      standing: {
        index: {
          score: standing.index.score,
          status: standing.index.status,
          snapshotDate: standing.index.snapshotDate,
        },
        level: standing.level,
        streak: standing.streak,
      },
      awards: mappedAwards,
      ranking,
    };
  }
}
