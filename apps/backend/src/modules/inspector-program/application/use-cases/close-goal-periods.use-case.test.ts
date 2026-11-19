import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INSPECTOR_PROGRAM, DEFAULT_RELIABILITY_INDEX, type PlatformSettingKey } from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ReliabilityComputationBatch } from '../../../reliability/application/reliability-metrics.service';
import type { CurrentIndex } from '../../../reliability/application/reliability-index.reader';
import { buildComputation, buildGoal } from '../../domain/__fixtures__/builders';
import type { GoalWithScope, IGoalRepository } from '../../domain/goal.repository';
import type { GoalPeriodClosureInsert, IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import type { IProgramInspectorReader } from '../../domain/program-inspector.reader';
import type { IRewardAwardRepository, RewardAwardInsert } from '../../domain/reward-award.repository';
import { CloseGoalPeriodsUseCase } from './close-goal-periods.use-case';
import type { InspectorProgramDailyStepContext } from './run-inspector-program-daily.use-case';

const SYDNEY_0445 = new Date('2026-11-08T17:45:00.000Z'); // 2026-11-09 04:45 AEDT → today 2026-11-09

const scoped = (goal: ReturnType<typeof buildGoal>, scope?: Partial<GoalWithScope['scope']>): GoalWithScope => ({
  ...goal,
  scope: { regionName: null, serviceTypeName: null, inspectorName: null, ...scope },
});

const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);

function settingsReader(): IPlatformSettingsReader {
  return {
    get: (async (key: PlatformSettingKey) => {
      if (key === 'inspectorProgram') return DEFAULT_INSPECTOR_PROGRAM;
      if (key === 'reliabilityIndex') return DEFAULT_RELIABILITY_INDEX;
      throw new Error(`unexpected ${key}`);
    }) as IPlatformSettingsReader['get'],
  } as IPlatformSettingsReader;
}


function ctx(trigger: InspectorProgramDailyStepContext['trigger'] = 'SCHEDULED'): InspectorProgramDailyStepContext {
  return { now: SYDNEY_0445, today: '2026-11-09', trigger, createdAwardIds: [] };
}

interface Harness {
  useCase: CloseGoalPeriodsUseCase;
  closures: GoalPeriodClosureInsert[];
  awards: RewardAwardInsert[];
  promoted: Array<{ id: string; target: number; rewardAmount: number }>;
  audits: Array<{ action: string; entityId?: string; before?: unknown; after?: unknown; metadata?: unknown }>;
  computeAllCalls: Array<{ from: string; to: string; ids: string[]; scope: unknown }>;
  logger: Logger;
}

function makeHarness(opts: {
  goals: GoalWithScope[];
  byInspector?: Map<string, ReturnType<typeof buildComputation>>;
  indexes?: CurrentIndex[];
  existingClosureStarts?: Map<string, Set<string>>;
  insertReturnsZero?: boolean;
}): Harness {
  const closures: GoalPeriodClosureInsert[] = [];
  const awards: RewardAwardInsert[] = [];
  const promoted: Harness['promoted'] = [];
  const audits: Harness['audits'] = [];
  const computeAllCalls: Harness['computeAllCalls'] = [];
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

  const goalRepo = {
    findActive: async () => opts.goals,
    promoteNextTerms: async (id: string, terms: { target: number; rewardAmount: number }) => {
      promoted.push({ id, ...terms });
    },
  } as unknown as IGoalRepository;

  const closureRepo = {
    findStartsByGoalIds: async () => opts.existingClosureStarts ?? new Map(),
    insertManySkipDuplicates: async (rows: GoalPeriodClosureInsert[]) => {
      if (opts.insertReturnsZero) return { count: 0 };
      closures.push(...rows);
      return { count: rows.length };
    },
  } as unknown as IGoalPeriodClosureRepository;

  let awardSeq = 0;
  const rewardRepo = {
    insertManySkipDuplicates: async (rows: RewardAwardInsert[]) => {
      awards.push(...rows);
      return { count: rows.length };
    },
    findByGoalPeriod: async (goalId: string, periodStart: string) =>
      awards
        .filter((a) => a.goalId === goalId && a.periodStart === periodStart)
        .map((a) => ({ ...a, id: `award-${awardSeq++}` })) as never,
  } as unknown as IRewardAwardRepository;

  const inspectorReader = {
    loadActiveInspectors: async () =>
      [...(opts.byInspector?.keys() ?? [])].map((id) => ({ id, status: 'ACTIVE', deletedAt: null, serviceTypeIds: [] })),
    loadRegionInspectorIds: async () => new Map<string, Set<string>>(),
  } as unknown as IProgramInspectorReader;

  const metricsService = {
    computeAll: async (from: string, to: string, ids?: string[], scope?: unknown): Promise<ReliabilityComputationBatch> => {
      computeAllCalls.push({ from, to, ids: ids ?? [], scope });
      const byInspector = new Map(
        (ids ?? []).filter((id) => opts.byInspector?.has(id)).map((id) => [id, opts.byInspector!.get(id)!]),
      );
      return { volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 7 }, byInspector };
    },
  };

  const indexReader = { getCurrentIndexes: async () => opts.indexes ?? [] };

  const auditService = {
    log: (entry: { action: string; entityId?: string; before?: unknown; after?: unknown; metadata?: unknown }) => {
      audits.push(entry);
    },
  } as unknown as AuditService;

  const useCase = new CloseGoalPeriodsUseCase(
    goalRepo,
    closureRepo,
    rewardRepo,
    inspectorReader,
    metricsService,
    indexReader,
    settingsReader(),
    auditService,
    logger,
    // prisma undefined → runInTransaction runs unwrapped, defers flush after fn
  );
  return { useCase, closures, awards, promoted, audits, computeAllCalls, logger };
}

const index = (inspectorId: string, score: number | null, snapshotDate: string | null): CurrentIndex => ({
  inspectorId,
  score,
  status: score === null ? 'NOT_COMPUTED' : 'SCORED',
  position: 1,
  volume: 12,
  snapshotDate,
});

describe('CloseGoalPeriodsUseCase (03.A4)', () => {
  it('creates one PENDING award per achiever with the goal snapshot and one closure', async () => {
    const goal = scoped(buildGoal({ id: 'g1', target: 10, rewardAmount: 30 }));
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([
        ['a', buildComputation({ completedServiceDates: dates(12) })],
        ['b', buildComputation({ completedServiceDates: dates(10) })],
        ['c', buildComputation({ completedServiceDates: dates(8) })],
      ]),
      indexes: [index('a', 88, '2026-11-09'), index('b', 70, '2026-11-09'), index('c', 50, '2026-11-09')],
    });
    await h.useCase.run(ctx());

    expect(h.closures).toHaveLength(1);
    expect(h.closures[0]).toMatchObject({
      goalId: 'g1',
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
      participantsCount: 3,
      achieversCount: 2,
      promisedAmount: 90,
      indexSnapshotDate: '2026-11-09',
      trigger: 'SCHEDULED',
    });
    expect(h.awards).toHaveLength(2);
    const a = h.awards.find((x) => x.inspectorId === 'a')!;
    expect(a).toMatchObject({ amount: 30, target: 10, achievedValue: 12, indexScoreAtClose: 88, levelAtClose: 'GOLD' });
    expect(h.awards.map((x) => x.inspectorId).sort()).toEqual(['a', 'b']);
    expect(h.audits.filter((x) => x.action === 'goal_period.closed')).toHaveLength(1);
    expect(h.audits.filter((x) => x.action === 'reward_award.created')).toHaveLength(2);
  });

  it('is idempotent: when the closure already exists (insert count 0) no award is written or audited', async () => {
    const goal = scoped(buildGoal({ id: 'g1' }));
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(12) })]]),
      indexes: [index('a', 88, '2026-11-09')],
      insertReturnsZero: true,
    });
    await h.useCase.run(ctx());
    expect(h.awards).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it('already-closed periods are skipped via closedStarts', async () => {
    const goal = scoped(buildGoal({ id: 'g1' }));
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(12) })]]),
      indexes: [index('a', 88, '2026-11-09')],
      existingClosureStarts: new Map([['g1', new Set(['2026-11-02'])]]),
    });
    await h.useCase.run(ctx());
    expect(h.closures).toHaveLength(0);
    expect(h.computeAllCalls).toHaveLength(0);
  });

  it('passes the period + scope to computeAll (one call per period/scope group)', async () => {
    const goal = scoped(buildGoal({ id: 'g1', metric: 'REGION_VOLUME', scopeRegionId: 'r1', target: 9 }), {
      regionName: 'Sydney North',
    });
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(10) })]]),
      indexes: [index('a', 88, '2026-11-09')],
    });
    // region membership: inspector a linked to r1
    (h.useCase as unknown as { inspectorReader: IProgramInspectorReader }).inspectorReader.loadRegionInspectorIds = async () =>
      new Map([['r1', new Set(['a'])]]);

    await h.useCase.run(ctx());
    expect(h.computeAllCalls).toHaveLength(1);
    expect(h.computeAllCalls[0]).toMatchObject({ from: '2026-11-02', to: '2026-11-08', scope: { regionId: 'r1' } });
    expect(h.awards[0]?.scopeLabel).toBe('Sydney North');
    expect(h.closures[0]?.scopeLabel).toBe('Sydney North');
  });

  it('DR2: a stale snapshot still closes, stores the stale date, and logs a warning', async () => {
    const goal = scoped(buildGoal({ id: 'g1' }));
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(12) })]]),
      indexes: [index('a', 88, '2026-11-08')], // yesterday
    });
    await h.useCase.run(ctx());
    expect(h.closures[0]?.indexSnapshotDate).toBe('2026-11-08');
    expect(h.awards[0]?.indexSnapshotDate).toBe('2026-11-08');
    expect(h.logger.warn).toHaveBeenCalledWith(
      { snapshotDate: '2026-11-08', today: '2026-11-09' },
      'inspector_program.index_snapshot_stale',
    );
  });

  it('DR2: with no snapshot, index/level/snapshotDate are null', async () => {
    const goal = scoped(buildGoal({ id: 'g1' }));
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(12) })]]),
      indexes: [index('a', null, null)],
    });
    await h.useCase.run(ctx());
    expect(h.awards[0]).toMatchObject({ indexScoreAtClose: null, levelAtClose: null, indexSnapshotDate: null });
  });

  it('L-F08-02: promotes next_* terms when the change is in effect, using the old terms for the closing period', async () => {
    // today 2026-11-16 (Mon): closes 2026-11-09..15 with old terms, promotes next_* (effective 2026-11-16)
    const goal = scoped(
      buildGoal({ id: 'g1', target: 10, rewardAmount: 30, nextTarget: 12, nextRewardAmount: 40, nextEffectiveFrom: '2026-11-16' }),
    );
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(11) })]]),
      indexes: [index('a', 88, '2026-11-16')],
      existingClosureStarts: new Map([['g1', new Set(['2026-11-02'])]]),
    });
    await h.useCase.run({ now: new Date('2026-11-15T17:45:00.000Z'), today: '2026-11-16', trigger: 'SCHEDULED', createdAwardIds: [] });
    expect(h.awards[0]).toMatchObject({ target: 10, amount: 30 }); // closing period used the OLD terms
    expect(h.promoted).toEqual([{ id: 'g1', target: 12, rewardAmount: 40 }]);
    expect(h.audits.some((x) => x.action === 'inspector_goal.terms_applied')).toBe(true);
  });

  it('L-F08-02: a catch-up run evaluates a >= next_effective_from period against the in-force (new) target', async () => {
    // Downtime across the terms change: the period starting ON next_effective_from (2026-11-09)
    // closes on a STARTUP run before promotion. Its in-force target is the NEW 12, so an
    // inspector with 11 completions must NOT be awarded (bug would evaluate against the old 10).
    const goal = scoped(
      buildGoal({ id: 'g1', target: 10, rewardAmount: 30, nextTarget: 12, nextRewardAmount: 40, nextEffectiveFrom: '2026-11-09' }),
    );
    const h = makeHarness({
      goals: [goal],
      byInspector: new Map([['a', buildComputation({ completedServiceDates: dates(11) })]]),
      indexes: [index('a', 88, '2026-11-16')],
      existingClosureStarts: new Map([['g1', new Set(['2026-11-02'])]]),
    });
    await h.useCase.run({ now: new Date('2026-11-15T17:45:00.000Z'), today: '2026-11-16', trigger: 'STARTUP', createdAwardIds: [] });
    expect(h.awards).toHaveLength(0); // 11 < in-force target 12 → not achieved
    expect(h.closures[0]).toMatchObject({ promisedAmount: 40, trigger: 'STARTUP' }); // reward 40 × 1 participant
    expect(h.promoted).toEqual([{ id: 'g1', target: 12, rewardAmount: 40 }]);
  });
});
