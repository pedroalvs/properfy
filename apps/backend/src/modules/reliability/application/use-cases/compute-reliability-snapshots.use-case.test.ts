import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELIABILITY_METRIC_KEYS,
  type ReliabilityMetricResult,
  resolvePlatformSettingValue,
} from '@properfy/shared';
import { ComputeReliabilitySnapshotsUseCase } from './compute-reliability-snapshots.use-case';
import type { ReliabilityComputationBatch } from '../reliability-metrics.service';
import type { NewReliabilitySnapshotRow } from '../../domain/reliability-snapshot.entity';
import type {
  IReliabilitySnapshotRepository,
  PurgeResult,
} from '../../domain/reliability-snapshot.repository';

const NOW = new Date('2026-12-01T17:15:00.000Z'); // 2026-12-02 04:15 AEDT

function fakeMetric(metric: string, rate: number): ReliabilityMetricResult {
  return {
    metric: metric as ReliabilityMetricResult['metric'],
    rate,
    eligibleCount: 10,
    successCount: Math.round(rate * 10),
    averageRating: null,
    volumeReference: null,
    weightedSuccess: rate * 100,
    weightedEligible: 100,
    volume: 10,
    activeDays: null,
    failureCount: 0,
    failures: [],
  };
}

function metricsAt(rate: number): ReliabilityMetricResult[] {
  return RELIABILITY_METRIC_KEYS.map((m) => fakeMetric(m, rate));
}

function batchFixture(): ReliabilityComputationBatch {
  return {
    volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 },
    byInspector: new Map([
      ['ana', { inspectorId: 'ana', volume: 12, completedCount: 12, metrics: metricsAt(0.9) }],
      ['ben', { inspectorId: 'ben', volume: 10, completedCount: 10, metrics: metricsAt(0.8) }],
    ]),
  };
}

interface FakeRepoState {
  rowsByDate: Map<string, NewReliabilitySnapshotRow[]>;
  calls: string[];
  purgeResult: PurgeResult;
  inspectorIds: string[];
}

function makeFakeRepo(state: FakeRepoState): IReliabilitySnapshotRepository {
  return {
    withComputeTransaction: async (fn) => fn({} as never),
    acquireComputeLock: async () => {
      state.calls.push('lock');
    },
    listNonDeletedInspectorIds: async () => state.inspectorIds,
    replaceForDate: async (_tx, date, rows) => {
      state.rowsByDate.set(date, rows);
    },
    purgeOlderThanAndDeleted: async () => {
      state.calls.push('purge');
      return state.purgeResult;
    },
    findLatestSnapshotDate: async () => null,
    findRowsByDate: async () => [],
    listActiveInspectorsWithoutRow: async () => [],
    findInspector: async () => null,
    findRowComputedAtForDate: async () => null,
    findReliabilitySettingsUpdatedAt: async () => null,
  };
}

function makeSettingsReader(calls: string[]) {
  return {
    get: vi.fn(async (key: string) => {
      calls.push(`settings:${key}`);
      if (key === 'reliabilityIndex') return resolvePlatformSettingValue('reliabilityIndex', null).value;
      if (key === 'fieldEvents') return resolvePlatformSettingValue('fieldEvents', null).value;
      throw new Error(`unexpected key ${key}`);
    }),
  } as never;
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
}

describe('ComputeReliabilitySnapshotsUseCase', () => {
  let state: FakeRepoState;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    state = {
      rowsByDate: new Map(),
      calls,
      purgeResult: { count: 0, deletedInspectors: 0 },
      inspectorIds: ['ana', 'ben', 'carla'],
    };
  });

  it('writes one row per non-deleted inspector with the documented window and settings', async () => {
    const computeAllWith = vi.fn(async () => batchFixture());
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith } as never,
      makeSettingsReader(calls),
      makeLogger(),
    );

    const result = await uc.execute({ trigger: 'SCHEDULED', now: NOW });

    const rows = state.rowsByDate.get('2026-12-02')!;
    expect(rows).toHaveLength(3);
    expect(result).toMatchObject({ snapshotDate: '2026-12-02', inspectors: 3, scored: 2, insufficient: 1 });
    for (const row of rows) {
      expect(row.snapshotDate).toBe('2026-12-02');
      expect(row.windowFrom).toBe('2026-11-02');
      expect(row.windowTo).toBe('2026-12-01');
      expect(row.windowDays).toBe(30);
      expect(row.trigger).toBe('SCHEDULED');
      expect(row.settings.volumeReference.value).toBe(9.5);
      expect(row.settings.minimumRatings).toBe(3);
      expect(row.settings.toleranceMinutes).toBe(15);
      expect(row.metrics).toHaveLength(8);
    }
    expect(computeAllWith).toHaveBeenCalledTimes(1);
  });

  it('computes the batch once (unfiltered), never per inspector', async () => {
    const computeAllWith = vi.fn(async (_tx: unknown, _from: string, _to: string) => batchFixture());
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith } as never,
      makeSettingsReader(calls),
      makeLogger(),
    );
    await uc.execute({ trigger: 'SCHEDULED', now: NOW });
    expect(computeAllWith).toHaveBeenCalledTimes(1);
    expect(computeAllWith).toHaveBeenCalledWith(expect.anything(), '2026-11-02', '2026-12-01', expect.anything());
  });

  it('synthesizes an empty inspector (no facts) as INSUFFICIENT_VOLUME with VOLUME rate 0', async () => {
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith: async () => batchFixture() } as never,
      makeSettingsReader(calls),
      makeLogger(),
    );
    await uc.execute({ trigger: 'SCHEDULED', now: NOW });

    const carla = state.rowsByDate.get('2026-12-02')!.find((r) => r.inspectorId === 'carla')!;
    expect(carla.status).toBe('INSUFFICIENT_VOLUME');
    expect(carla.score).toBeNull();
    expect(carla.volume).toBe(0);
    const volumeMetric = carla.metrics.find((m) => m.metric === 'VOLUME')!;
    expect(volumeMetric.rate).toBe(0);
    for (const m of carla.metrics.filter((x) => x.metric !== 'VOLUME')) {
      expect(m.rate).toBeNull();
    }
  });

  it('reads settings AFTER acquiring the lock', async () => {
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith: async () => batchFixture() } as never,
      makeSettingsReader(calls),
      makeLogger(),
    );
    await uc.execute({ trigger: 'SCHEDULED', now: NOW });
    expect(calls[0]).toBe('lock');
    expect(calls).toContain('settings:reliabilityIndex');
    expect(calls).toContain('settings:fieldEvents');
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('settings:reliabilityIndex'));
  });

  it('is idempotent — running twice replaces the day with the same row count and the later computed_at', async () => {
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith: async () => batchFixture() } as never,
      makeSettingsReader(calls),
      makeLogger(),
    );
    await uc.execute({ trigger: 'SCHEDULED', now: NOW });
    const later = new Date('2026-12-01T17:20:00.000Z');
    await uc.execute({ trigger: 'SCHEDULED', now: later });
    const rows = state.rowsByDate.get('2026-12-02')!;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.computedAt).toEqual(later);
  });

  it('purges only on a SCHEDULED trigger', async () => {
    const run = async (trigger: 'SCHEDULED' | 'SETTINGS_CHANGED' | 'BACKFILL') => {
      const local: FakeRepoState = { ...state, calls: [], rowsByDate: new Map() };
      const uc = new ComputeReliabilitySnapshotsUseCase(
        makeFakeRepo(local),
        { computeAllWith: async () => batchFixture() } as never,
        makeSettingsReader([]),
        makeLogger(),
      );
      await uc.execute({ trigger, now: NOW });
      return local.calls.includes('purge');
    };
    expect(await run('SCHEDULED')).toBe(true);
    expect(await run('SETTINGS_CHANGED')).toBe(false);
    expect(await run('BACKFILL')).toBe(false);
  });

  it('rolls back and rethrows when the compute fails, writing no rows and logging snapshots_failed', async () => {
    const logger = makeLogger();
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      {
        computeAllWith: async () => {
          throw new Error('boom');
        },
      } as never,
      makeSettingsReader(calls),
      logger,
    );
    await expect(uc.execute({ trigger: 'SCHEDULED', now: NOW, attempt: 3 })).rejects.toThrow('boom');
    expect(state.rowsByDate.size).toBe(0);
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith(
      { snapshotDate: '2026-12-02', trigger: 'SCHEDULED', reason: 'Error: boom', attempt: 3 },
      'reliability.snapshots_failed',
    );
  });

  it('logs reason TIMEOUT for a transaction timeout (P2028)', async () => {
    const logger = makeLogger();
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      {
        computeAllWith: async () => {
          throw Object.assign(new Error('Transaction API error'), { code: 'P2028' });
        },
      } as never,
      makeSettingsReader(calls),
      logger,
    );
    await expect(uc.execute({ trigger: 'SCHEDULED', now: NOW })).rejects.toThrow();
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'TIMEOUT', attempt: 1 }),
      'reliability.snapshots_failed',
    );
  });

  it('logs snapshots_computed with counts', async () => {
    const logger = makeLogger();
    const uc = new ComputeReliabilitySnapshotsUseCase(
      makeFakeRepo(state),
      { computeAllWith: async () => batchFixture() } as never,
      makeSettingsReader(calls),
      logger,
    );
    await uc.execute({ trigger: 'SCHEDULED', now: NOW });
    expect((logger as unknown as { info: ReturnType<typeof vi.fn> }).info).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotDate: '2026-12-02', trigger: 'SCHEDULED', inspectors: 3, scored: 2, insufficient: 1 }),
      'reliability.snapshots_computed',
    );
  });
});
