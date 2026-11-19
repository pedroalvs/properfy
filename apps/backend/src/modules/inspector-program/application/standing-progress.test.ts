import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INSPECTOR_PROGRAM, DEFAULT_RELIABILITY_INDEX, type PlatformSettingKey } from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import type { Clock } from '../../../shared/domain/clock';
import type { ReliabilityComputationBatch } from '../../reliability/application/reliability-metrics.service';
import { buildComputation, buildGoal } from '../domain/__fixtures__/builders';
import type { GoalWithScope, IGoalRepository } from '../domain/goal.repository';
import type { IGoalPeriodClosureRepository } from '../domain/goal-period-closure.repository';
import type { IProgramInspectorReader } from '../domain/program-inspector.reader';
import { InspectorProgramStandingService } from './inspector-program-standing.service';

const NOW = new Date('2026-11-11T02:00:00.000Z'); // 2026-11-11 13:00 AEDT → today 2026-11-11
const INSP = 'insp-1';

const scoped = (goal: ReturnType<typeof buildGoal>): GoalWithScope => ({
  ...goal,
  scope: { regionName: null, serviceTypeName: null, inspectorName: null },
});

function makeService(opts: {
  goals: GoalWithScope[];
  computation?: ReturnType<typeof buildComputation>;
  closedStarts?: Map<string, Set<string>>;
  onComputeAll?: () => void;
}): InspectorProgramStandingService {
  const goalRepo = { findActive: async () => opts.goals } as unknown as IGoalRepository;
  const closureRepo = {
    findStartsByGoalIds: async () => opts.closedStarts ?? new Map(),
    findParticipations: async () => [],
  } as unknown as IGoalPeriodClosureRepository;
  const inspectorReader = {
    loadActiveInspectors: async () => [{ id: INSP, status: 'ACTIVE', deletedAt: null, serviceTypeIds: [] }],
    loadRegionInspectorIds: async () => new Map<string, Set<string>>(),
  } as unknown as IProgramInspectorReader;
  const metricsService = {
    computeAll: async (_from: string, _to: string, ids?: string[]): Promise<ReliabilityComputationBatch> => {
      opts.onComputeAll?.();
      const byInspector = new Map((ids ?? []).map((id) => [id, opts.computation ?? buildComputation({})]));
      return { volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 7 }, byInspector };
    },
  };
  const indexReader = { getCurrentIndexes: async () => [] };
  const settingsReader = {
    get: (async (key: PlatformSettingKey) => {
      if (key === 'inspectorProgram') return DEFAULT_INSPECTOR_PROGRAM;
      if (key === 'reliabilityIndex') return DEFAULT_RELIABILITY_INDEX;
      throw new Error(`unexpected ${key}`);
    }) as IPlatformSettingsReader['get'],
  } as IPlatformSettingsReader;
  const clock = { now: () => NOW } as Clock;

  return new InspectorProgramStandingService(
    goalRepo,
    closureRepo,
    inspectorReader,
    metricsService,
    indexReader,
    settingsReader,
    clock,
  );
}

describe('InspectorProgramStandingService.getActiveGoalProgress', () => {
  it('an active goal starting within 7 days is UPCOMING with no computeAll', async () => {
    const onComputeAll = vi.fn();
    const service = makeService({ goals: [scoped(buildGoal({ id: 'g1', startsAt: '2026-11-16' }))], onComputeAll });
    const progress = await service.getActiveGoalProgress(INSP, NOW);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      state: 'UPCOMING',
      period: { start: '2026-11-16', end: '2026-11-22' },
      value: null,
      serviceCount: 0,
      daysLeft: 5,
    });
    expect(onComputeAll).not.toHaveBeenCalled();
  });

  it('a goal starting beyond the look-ahead is omitted', async () => {
    const service = makeService({ goals: [scoped(buildGoal({ id: 'g1', period: 'MONTHLY', startsAt: '2026-12-01' }))] });
    expect(await service.getActiveGoalProgress(INSP, NOW)).toHaveLength(0);
  });

  it('a reactivated goal whose current period was skipped is UPCOMING from the next period', async () => {
    const service = makeService({
      goals: [scoped(buildGoal({ id: 'g1', startsAt: '2026-11-02' }))],
      closedStarts: new Map([['g1', new Set(['2026-11-09'])]]), // current period skipped
    });
    const progress = await service.getActiveGoalProgress(INSP, NOW);
    expect(progress[0]).toMatchObject({ state: 'UPCOMING', period: { start: '2026-11-16' } });
  });

  it('a goal created mid-period exposes countsSince = period start', async () => {
    const service = makeService({
      goals: [scoped(buildGoal({ id: 'g1', startsAt: '2026-11-09', createdAt: new Date('2026-11-11T00:00:00.000Z') }))],
      computation: buildComputation({ completedServiceDates: ['2026-11-10'] }),
    });
    const progress = await service.getActiveGoalProgress(INSP, NOW);
    expect(progress[0]).toMatchObject({ countsSince: '2026-11-09', period: { start: '2026-11-09', end: '2026-11-15' } });
  });

  it('a goal created at the period start has countsSince null', async () => {
    const service = makeService({
      goals: [scoped(buildGoal({ id: 'g1', startsAt: '2026-11-09', createdAt: new Date('2026-11-09T00:00:00.000Z') }))],
      computation: buildComputation({ completedServiceDates: ['2026-11-10'] }),
    });
    const progress = await service.getActiveGoalProgress(INSP, NOW);
    expect(progress[0]?.countsSince).toBeNull();
  });

  it('progress uses the current terms even when a pending change exists', async () => {
    const service = makeService({
      goals: [
        scoped(
          buildGoal({
            id: 'g1',
            startsAt: '2026-11-09',
            target: 10,
            rewardAmount: 30,
            nextTarget: 12,
            nextRewardAmount: 40,
            nextEffectiveFrom: '2026-11-16',
          }),
        ),
      ],
      computation: buildComputation({ completedServiceDates: ['2026-11-10'] }),
    });
    const progress = await service.getActiveGoalProgress(INSP, NOW);
    expect(progress[0]).toMatchObject({ target: 10, rewardAmount: 30 });
  });
});
