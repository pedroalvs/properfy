import { describe, expect, it, vi } from 'vitest';
import type { SnapshotSettings, StoredReliabilitySnapshotRow } from '../../../reliability/domain/reliability-snapshot.entity';
import type { ParticipantInspector } from '../../domain/participants';
import type { RewardAward } from '../../domain/reward-award.entity';
import type { StreakParticipation } from '../../domain/streak';
import type { GoalProgress } from '../inspector-program-standing.service';
import { RunInspectorProgramDailyUseCase } from '../use-cases/run-inspector-program-daily.use-case';
import { SendGoalReachedMessagesStep } from './send-goal-reached-messages.step';
import { SendLevelChangeMessagesStep } from './send-level-change-messages.step';
import { SendStreakRiskMessagesStep } from './send-streak-risk-messages.step';

const NOW = new Date('2026-11-09T21:00:00.000Z'); // 08:00 Sydney on 9 Nov
const TODAY = '2026-11-09';

function publishSpy(created = true) {
  return { execute: vi.fn().mockResolvedValue({ noticeId: 'n', created }) };
}

function active(ids: string[]): ParticipantInspector[] {
  return ids.map((id) => ({ id, status: 'ACTIVE', deletedAt: null, serviceTypeIds: [] }));
}

function award(overrides: Partial<RewardAward>): RewardAward {
  return {
    id: 'a', goalId: 'g', inspectorId: 'i1', periodType: 'WEEKLY', periodStart: '2026-11-02',
    periodEnd: '2026-11-08', goalTitle: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10,
    amount: 30, scopeLabel: null, achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-06',
    indexScoreAtClose: 80, levelAtClose: 'SILVER', indexSnapshotDate: '2026-11-08', status: 'PENDING',
    approvedByUserId: null, approvedAt: null, paidAt: null, voidedByUserId: null, voidedAt: null,
    voidReason: null, inspectorNote: null, inspectorInvoiceId: null,
    createdAt: new Date('2026-11-09T04:45:00.000Z'), updatedAt: new Date('2026-11-09T04:45:00.000Z'),
    ...overrides,
  };
}

const SETTINGS: SnapshotSettings = {
  weights: { PUNCTUALITY: 1, GEOFENCE: 1, NO_STUCK: 1, SATISFACTION: 1, LATE_NOTICE: 1, CANT_ATTEND: 1, VOLUME: 1, DONE_REJECTED: 1 },
  minimumVolume: 10, minimumRatings: 3, toleranceMinutes: 10,
  volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 },
};

function snapRow(inspectorId: string, score: number | null, extra?: Partial<StoredReliabilitySnapshotRow>): StoredReliabilitySnapshotRow {
  return {
    inspectorId, inspectorName: 'X', inspectorActive: true, snapshotDate: TODAY,
    windowFrom: '2026-10-10', windowTo: TODAY, windowDays: 30,
    status: score === null ? 'INSUFFICIENT_VOLUME' : 'SCORED', score, volume: 15, completedCount: 15,
    metrics: [], settings: SETTINGS, computedAt: NOW, ...extra,
  };
}

const settingsReader = { get: (async () => ({ levels: { silverMinScore: 60, goldMinScore: 85 } })) as never };
const ctx = (trigger: 'SCHEDULED' | 'MESSAGES') => ({ now: NOW, today: TODAY, trigger, createdAwardIds: [] });

describe('SendGoalReachedMessagesStep', () => {
  it('publishes one notice per (inspector, periodEnd) with the single-goal copy', async () => {
    const publish = publishSpy();
    const step = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => [award({ inspectorId: 'i1' })] },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).toHaveBeenCalledTimes(1);
    expect(publish.execute).toHaveBeenCalledWith({
      type: 'PERFORMANCE_MESSAGE',
      inspectorIds: ['i1'],
      title: 'Goal reached: Weekly volume',
      body: 'You reached "Weekly volume" for the week of Mon 2 Nov. Your $30.00 bonus will be reviewed and, once approved, added to your next invoice.',
      dedupeKey: 'program-goals-reached:i1:2026-11-08',
      targetPath: '/profile/challenges',
    });
  });

  it('aggregates four awards of the same inspector and period end into one notice', async () => {
    const publish = publishSpy();
    const awards = [
      award({ id: 'a1', goalTitle: 'Weekly volume', amount: 30, periodEnd: '2026-11-15', achievedValue: 100 }),
      award({ id: 'a2', goalTitle: 'On-time arrival', amount: 30, periodEnd: '2026-11-15', achievedValue: 90 }),
      award({ id: 'a3', goalTitle: 'Region volume', amount: 60, periodEnd: '2026-11-15', achievedValue: 80 }),
      award({ id: 'a4', goalTitle: 'Fortnight volume', amount: 40, periodType: 'FORTNIGHTLY', periodEnd: '2026-11-15', achievedValue: 70 }),
    ];
    const step = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => awards },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).toHaveBeenCalledTimes(1);
    expect(publish.execute.mock.calls[0]![0]).toMatchObject({
      title: 'You reached 4 goals',
      body: 'You reached "Weekly volume", "On-time arrival", "Region volume" and "Fortnight volume". Your bonuses (total $160.00) will be reviewed and, once approved, added to your next invoice.',
      dedupeKey: 'program-goals-reached:i1:2026-11-15',
    });
  });

  it('keeps same-start different-end awards as two distinct notices', async () => {
    const publish = publishSpy();
    const awards = [
      award({ id: 'wk', periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08' }),
      award({ id: 'fn', periodType: 'FORTNIGHTLY', periodStart: '2026-11-02', periodEnd: '2026-11-15' }),
    ];
    const step = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => awards },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    await step.run(ctx('MESSAGES'));
    const keys = publish.execute.mock.calls.map((c) => (c[0] as { dedupeKey: string }).dedupeKey).sort();
    expect(keys).toEqual(['program-goals-reached:i1:2026-11-08', 'program-goals-reached:i1:2026-11-15']);
  });

  it('publishes one notice per inspector', async () => {
    const publish = publishSpy();
    const step = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => [award({ inspectorId: 'i1' }), award({ inspectorId: 'i2' })] },
      { loadActiveInspectors: async () => active(['i1', 'i2']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).toHaveBeenCalledTimes(2);
  });

  it('skips inactive inspectors and void awards', async () => {
    const publish = publishSpy();
    const step = new SendGoalReachedMessagesStep(
      {
        findRecentByInspector: async () => [],
        findRecentNonVoidByCreatedAt: async () => [award({ inspectorId: 'ghost' }), award({ inspectorId: 'i1', status: 'VOID' })],
      },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).not.toHaveBeenCalled();
  });
});

describe('SendLevelChangeMessagesStep', () => {
  function makeStep(latestRows: StoredReliabilitySnapshotRow[], prevRows: StoredReliabilitySnapshotRow[], publish = publishSpy(), lastNoticeAt: Date | null = null) {
    const snapshotRepo = {
      findLatestSnapshotDate: async () => TODAY,
      findRowsByDate: async (date: string) => (date === TODAY ? latestRows : prevRows),
    };
    const recentNotices = {
      hasRecentNotice: async (_prefix: string, since: Date) => lastNoticeAt !== null && lastNoticeAt.getTime() >= since.getTime(),
    };
    return { step: new SendLevelChangeMessagesStep(snapshotRepo, settingsReader, recentNotices, publish as never), publish };
  }

  it('publishes a level-up notice when the score crosses up with the same tuning', async () => {
    const { step, publish } = makeStep([snapRow('i1', 86)], [snapRow('i1', 82)]);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).toHaveBeenCalledTimes(1);
    expect(publish.execute.mock.calls[0]![0]).toMatchObject({
      title: "You're now Gold",
      body: 'Your reliability index is 86.0. Keep it up to stay at Gold.',
      dedupeKey: 'program-level:i1:2026-11-09',
      targetPath: '/profile/challenges',
    });
  });

  it('publishes a level-down notice with the regain threshold', async () => {
    const { step, publish } = makeStep([snapRow('i1', 83)], [snapRow('i1', 86)]);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute.mock.calls[0]![0]).toMatchObject({
      title: "You're now Silver",
      body: 'Your reliability index is 83.0. Reach 85.0 to get back to Gold.',
    });
  });

  it('sends nothing and logs when the index tuning changed between the two days', async () => {
    const heavier: SnapshotSettings = { ...SETTINGS, weights: { ...SETTINGS.weights, PUNCTUALITY: 3 } };
    const { step, publish } = makeStep([snapRow('i1', 86)], [snapRow('i1', 82, { settings: heavier })]);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('still sends when only the volume-reference value changed (data, not tuning)', async () => {
    const prevSettings: SnapshotSettings = { ...SETTINGS, volumeReference: { value: 8, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 } };
    const { step, publish } = makeStep([snapRow('i1', 86)], [snapRow('i1', 82, { settings: prevSettings })]);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).toHaveBeenCalledTimes(1);
  });

  it('suppresses when a level notice was sent within the last 7 days (4 days ago)', async () => {
    const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000);
    const { step, publish } = makeStep([snapRow('i1', 86)], [snapRow('i1', 82)], publishSpy(), fourDaysAgo);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('sends after 8 days and at exactly 7 days (min 7-day spacing)', async () => {
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const r1 = makeStep([snapRow('i1', 86)], [snapRow('i1', 82)], publishSpy(), eightDaysAgo);
    await r1.step.run(ctx('MESSAGES'));
    expect(r1.publish.execute).toHaveBeenCalledTimes(1);

    const exactlySevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const r2 = makeStep([snapRow('i1', 86)], [snapRow('i1', 82)], publishSpy(), exactlySevenDaysAgo);
    await r2.step.run(ctx('MESSAGES'));
    expect(r2.publish.execute).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when a level is null on either day', async () => {
    const a = makeStep([snapRow('i1', null)], [snapRow('i1', 82)]);
    await a.step.run(ctx('MESSAGES'));
    expect(a.publish.execute).not.toHaveBeenCalled();
    const b = makeStep([snapRow('i1', 86)], [snapRow('i1', null)]);
    await b.step.run(ctx('MESSAGES'));
    expect(b.publish.execute).not.toHaveBeenCalled();
  });

  it('sends nothing (and does not read history) when the latest snapshot is not today', async () => {
    const publish = publishSpy();
    const findRowsByDate = vi.fn(async () => [snapRow('i1', 86)]);
    const snapshotRepo = { findLatestSnapshotDate: async () => '2026-11-07', findRowsByDate };
    const recentNotices = { hasRecentNotice: async () => false };
    const step = new SendLevelChangeMessagesStep(snapshotRepo, settingsReader, recentNotices, publish as never);
    await step.run(ctx('MESSAGES'));
    expect(publish.execute).not.toHaveBeenCalled();
    expect(findRowsByDate).not.toHaveBeenCalled();
  });

  it('reads only findLatestSnapshotDate + findRowsByDate (latest and latest-1), never a history reader', async () => {
    const findRowsByDate = vi.fn(async (date: string) => (date === TODAY ? [snapRow('i1', 86)] : [snapRow('i1', 82)]));
    const snapshotRepo = { findLatestSnapshotDate: vi.fn(async () => TODAY), findRowsByDate };
    const recentNotices = { hasRecentNotice: async () => false };
    const step = new SendLevelChangeMessagesStep(snapshotRepo, settingsReader, recentNotices, publishSpy() as never);
    await step.run(ctx('MESSAGES'));
    expect(snapshotRepo.findLatestSnapshotDate).toHaveBeenCalledTimes(1);
    expect(findRowsByDate.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-11-08', '2026-11-09']);
  });
});

describe('SendStreakRiskMessagesStep', () => {
  // 2026-11-02 is a Monday, so 2026-11-08 is the Sunday that ends that weekly period.
  const SUNDAY = '2026-11-08';
  const SUNDAY_NOW = new Date('2026-11-08T21:00:00.000Z');
  const sundayCtx = () => ({ now: SUNDAY_NOW, today: SUNDAY, trigger: 'MESSAGES' as const, createdAwardIds: [] });

  function cycleProgress(state: GoalProgress['state']): GoalProgress {
    return {
      goalId: 'g', title: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10,
      period: { type: 'WEEKLY', start: '2026-11-02', end: SUNDAY }, daysLeft: 0, rewardAmount: 30,
      scopeLabel: null, value: 5, serviceCount: 5, countsSince: null, state,
    };
  }

  function makeStep(params: {
    progress: GoalProgress[];
    participations: StreakParticipation[];
    publish?: ReturnType<typeof publishSpy>;
  }) {
    const publish = params.publish ?? publishSpy();
    const inspectorReader = { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() };
    const standingService = { getActiveGoalProgressForMany: async () => new Map([['i1', params.progress]]) };
    const closureRepo = { findParticipations: async () => params.participations };
    return { step: new SendStreakRiskMessagesStep(inspectorReader, standingService, closureRepo, publish as never), publish };
  }

  const weeklyStreak: StreakParticipation[] = [
    { goalPeriodType: 'WEEKLY', periodStart: '2026-10-26', awarded: true },
    { goalPeriodType: 'WEEKLY', periodStart: '2026-10-19', awarded: true },
    { goalPeriodType: 'WEEKLY', periodStart: '2026-10-12', awarded: true },
  ];

  it('publishes when the streak is at risk on the last day of the cycle', async () => {
    const { step, publish } = makeStep({ progress: [cycleProgress('BELOW_TARGET')], participations: weeklyStreak });
    await step.run(sundayCtx());
    expect(publish.execute).toHaveBeenCalledTimes(1);
    expect(publish.execute.mock.calls[0]![0]).toMatchObject({
      title: 'Your 3-week streak is at risk',
      body: 'Today is the last day of the week. Reach any weekly goal to keep your streak going.',
      dedupeKey: 'program-streak-risk:i1:2026-11-02',
      targetPath: '/profile/challenges',
    });
  });

  it('sends nothing when a cycle goal was already met', async () => {
    const { step, publish } = makeStep({ progress: [cycleProgress('MET_SO_FAR')], participations: weeklyStreak });
    await step.run(sundayCtx());
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('sends nothing when there is no streak', async () => {
    const { step, publish } = makeStep({ progress: [cycleProgress('BELOW_TARGET')], participations: [] });
    await step.run(sundayCtx());
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('sends nothing when today is not the last day of the cycle', async () => {
    // 2026-11-04 is a Wednesday, mid-week.
    const { step, publish } = makeStep({ progress: [cycleProgress('BELOW_TARGET')], participations: weeklyStreak });
    await step.run({ now: new Date('2026-11-04T21:00:00.000Z'), today: '2026-11-04', trigger: 'MESSAGES', createdAwardIds: [] });
    expect(publish.execute).not.toHaveBeenCalled();
  });
});

describe('RunInspectorProgramDailyUseCase phase gating + isolation', () => {
  it('runs the message steps only under the MESSAGES trigger', async () => {
    const publish = publishSpy();
    const goalStep = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => [award({ inspectorId: 'i1' })] },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    const useCase = new RunInspectorProgramDailyUseCase([goalStep]);

    await useCase.execute({ trigger: 'SCHEDULED', now: NOW });
    expect(publish.execute).not.toHaveBeenCalled();

    await useCase.execute({ trigger: 'MESSAGES', now: NOW });
    expect(publish.execute).toHaveBeenCalledTimes(1);
  });

  it("a failing message step's internal error is swallowed and does not stop the others", async () => {
    const publish = publishSpy();
    // First step: its dependency throws. The step swallows it and logs (no rethrow).
    const failingStep = new SendGoalReachedMessagesStep(
      {
        findRecentByInspector: async () => [],
        findRecentNonVoidByCreatedAt: async () => {
          throw new Error('db down');
        },
      },
      { loadActiveInspectors: async () => active(['i1']), loadRegionInspectorIds: async () => new Map() },
      publishSpy() as never,
    );
    // Second step runs normally and publishes.
    const workingStep = new SendGoalReachedMessagesStep(
      { findRecentByInspector: async () => [], findRecentNonVoidByCreatedAt: async () => [award({ inspectorId: 'i2' })] },
      { loadActiveInspectors: async () => active(['i2']), loadRegionInspectorIds: async () => new Map() },
      publish as never,
    );
    const useCase = new RunInspectorProgramDailyUseCase([failingStep, workingStep]);
    await expect(useCase.execute({ trigger: 'MESSAGES', now: NOW })).resolves.toBeUndefined();
    expect(publish.execute).toHaveBeenCalledTimes(1);
  });
});
