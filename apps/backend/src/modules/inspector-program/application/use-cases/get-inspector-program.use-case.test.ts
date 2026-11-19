import { describe, expect, it } from 'vitest';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Clock } from '../../../../shared/domain/clock';
import type { CurrentIndex } from '../../../reliability/application/reliability-index.reader';
import type { GoalProgress, InspectorStanding } from '../inspector-program-standing.service';
import type { RewardAward } from '../../domain/reward-award.entity';
import type { IRecentRewardAwardReader } from '../../domain/recent-awards.reader';
import { GetInspectorProgramUseCase } from './get-inspector-program.use-case';

const NOW = new Date('2026-11-08T21:00:00.000Z');
const ME = 'me-1111';

const standingFixture: InspectorStanding = {
  inspectorId: ME,
  index: { score: 88.3, status: 'SCORED', snapshotDate: '2026-11-08', position: 4 },
  level: 'GOLD',
  streak: { cycle: 'WEEKLY', count: 3, atRisk: false },
};

const volumeGoal: GoalProgress = {
  goalId: 'g-volume',
  title: 'Weekly volume',
  metric: 'VOLUME',
  comparator: 'GTE',
  target: 60,
  period: { type: 'WEEKLY', start: '2026-11-02', end: '2026-11-08' },
  daysLeft: 0,
  rewardAmount: 60,
  scopeLabel: null,
  value: 47,
  serviceCount: 47,
  countsSince: null,
  state: 'IN_PROGRESS',
};

const upcomingRateGoal: GoalProgress = {
  goalId: 'g-punctuality',
  title: 'On-time arrival',
  metric: 'PUNCTUALITY',
  comparator: 'GTE',
  target: 95,
  period: { type: 'WEEKLY', start: '2026-11-16', end: '2026-11-22' },
  daysLeft: 8,
  rewardAmount: 50,
  scopeLabel: null,
  value: null,
  serviceCount: 0,
  countsSince: null,
  state: 'UPCOMING',
};

function award(overrides: Partial<RewardAward>): RewardAward {
  return {
    id: 'a-1',
    goalId: 'g-volume',
    inspectorId: ME,
    periodType: 'WEEKLY',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    goalTitle: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 60,
    amount: 60,
    scopeLabel: null,
    achievedValue: 61,
    serviceCount: 61,
    achievedOn: '2026-11-07',
    indexScoreAtClose: 88.3,
    levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08',
    status: 'PENDING',
    approvedByUserId: null,
    approvedAt: null,
    paidAt: null,
    voidedByUserId: null,
    voidedAt: null,
    voidReason: null,
    inspectorNote: null,
    inspectorInvoiceId: null,
    createdAt: new Date('2026-11-08T04:45:00.000Z'),
    updatedAt: new Date('2026-11-08T04:45:00.000Z'),
    ...overrides,
  };
}

function cohort(n: number): CurrentIndex[] {
  return Array.from({ length: n }, (_, i) => ({
    inspectorId: `insp-${i + 1}`,
    score: 95 - i,
    status: 'SCORED' as const,
    position: i + 1,
    volume: 12,
    snapshotDate: '2026-11-08',
  }));
}

function buildUseCase(overrides?: {
  standingValue?: InspectorStanding;
  progress?: GoalProgress[];
  indexes?: CurrentIndex[];
  awards?: RewardAward[];
}) {
  const standing = {
    getStanding: async () => overrides?.standingValue ?? standingFixture,
    getActiveGoalProgress: async () => overrides?.progress ?? [volumeGoal, upcomingRateGoal],
  };
  const indexReader = {
    getCurrentIndexes: async () =>
      overrides?.indexes ?? [
        { inspectorId: ME, score: 88.3, status: 'SCORED' as const, position: 4, volume: 20, snapshotDate: '2026-11-08' },
        ...cohort(6),
      ],
  };
  const recentAwards: IRecentRewardAwardReader = {
    findRecentByInspector: async () => overrides?.awards ?? [award({})],
    findRecentNonVoidByCreatedAt: async () => [],
  };
  const settings: IPlatformSettingsReader = {
    get: (async () => ({
      levels: { silverMinScore: 60, goldMinScore: 85 },
      earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null },
    })) as IPlatformSettingsReader['get'],
  };
  const clock: Clock = { now: () => NOW };
  return new GetInspectorProgramUseCase(standing, indexReader, recentAwards, settings, clock);
}

describe('GetInspectorProgramUseCase', () => {
  it('returns generatedAt, timezone and the AUD summary', async () => {
    const res = await buildUseCase().execute({ inspectorId: ME });
    expect(res.generatedAt).toBe(NOW.toISOString());
    expect(res.timezone).toBe('Australia/Sydney');
    expect(res.summary.currency).toBe('AUD');
  });

  it('sums openCashTotal over current-period goals only (excludes UPCOMING)', async () => {
    const res = await buildUseCase().execute({ inspectorId: ME });
    expect(res.summary.openCashTotal).toBe(60);
  });

  it('maps active goals: server-rendered description, rate minimumServices, UPCOMING startsOn', async () => {
    const res = await buildUseCase().execute({ inspectorId: ME });
    expect(res.activeGoals).toHaveLength(2);
    const volume = res.activeGoals.find((g) => g.goalId === 'g-volume')!;
    expect(volume.description.length).toBeGreaterThan(0);
    expect(volume.minimumServices).toBeNull();
    expect(volume.periodStart).toBe('2026-11-02');
    expect(volume.periodEnd).toBe('2026-11-08');
    expect(volume.startsOn).toBeNull();
    const punctuality = res.activeGoals.find((g) => g.goalId === 'g-punctuality')!;
    expect(punctuality.minimumServices).toBe(10);
    expect(punctuality.state).toBe('UPCOMING');
    expect(punctuality.startsOn).toBe('2026-11-16');
    expect(punctuality.value).toBeNull();
  });

  it('maps the standing without exposing the raw position field', async () => {
    const res = await buildUseCase().execute({ inspectorId: ME });
    expect(res.standing.index).toEqual({ score: 88.3, status: 'SCORED', snapshotDate: '2026-11-08' });
    expect(res.standing.level).toBe('GOLD');
    expect(res.standing.streak).toEqual({ cycle: 'WEEKLY', count: 3, atRisk: false });
  });

  it('maps awards with the inspector note and never the internal void reason', async () => {
    const res = await buildUseCase({
      awards: [
        award({ id: 'a-paid', status: 'PAID', paidAt: new Date('2026-11-20T02:00:00.000Z') }),
        award({
          id: 'a-void',
          status: 'VOID',
          voidedAt: new Date('2026-11-10T00:00:00.000Z'),
          voidReason: 'secret internal reason',
          inspectorNote: 'The job was cancelled by the agency.',
        }),
      ],
    }).execute({ inspectorId: ME });
    const paid = res.awards.find((a) => a.status === 'PAID')!;
    expect(paid.paidAt).toBe('2026-11-20T02:00:00.000Z');
    const voided = res.awards.find((a) => a.status === 'VOID')!;
    expect(voided.voidedAt).toBe('2026-11-10T00:00:00.000Z');
    expect(voided.inspectorNote).toBe('The job was cancelled by the agency.');
    for (const a of res.awards) expect(a).not.toHaveProperty('voidReason');
    expect(JSON.stringify(res)).not.toContain('secret internal reason');
  });

  it('builds the anonymous ranking from the full platform cohort (03.A3)', async () => {
    const res = await buildUseCase().execute({ inspectorId: ME });
    expect(res.ranking.myPosition).toBe(4);
    expect(res.ranking.myScore).toBe(88.3);
    expect(res.ranking.totalRanked).toBe(7);
    expect(res.ranking.entries.some((e) => e.isMe)).toBe(true);
    for (const e of res.ranking.entries) {
      expect(Object.keys(e).sort()).toEqual(['isMe', 'level', 'position', 'score']);
    }
    expect(JSON.stringify(res.ranking)).not.toContain('insp-');
  });
});
