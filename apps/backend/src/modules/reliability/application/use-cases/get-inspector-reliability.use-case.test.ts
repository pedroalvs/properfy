import { describe, expect, it, vi } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { RELIABILITY_METRIC_KEYS, resolvePlatformSettingValue, type ReliabilityMetricResult } from '@properfy/shared';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import { ReliabilityIndexReader } from '../reliability-index.reader';
import { GetInspectorReliabilityUseCase } from './get-inspector-reliability.use-case';
import type { SnapshotSettings, StoredReliabilitySnapshotRow } from '../../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository, ReliabilityInspectorRef } from '../../domain/reliability-snapshot.repository';

const SNAP = '2026-12-01';
const WEIGHTS = resolvePlatformSettingValue('reliabilityIndex', null).value.weights;

function actor(role: UserRole): AuthContext {
  return { userId: `u-${role}`, tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null };
}

function settings(): SnapshotSettings {
  return {
    weights: WEIGHTS,
    minimumVolume: 10,
    minimumRatings: 3,
    toleranceMinutes: 15,
    volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 },
  };
}

function metric(metricKey: string, rate: number | null): ReliabilityMetricResult {
  return {
    metric: metricKey as ReliabilityMetricResult['metric'],
    rate,
    eligibleCount: 10,
    successCount: rate === null ? null : Math.round(rate * 10),
    averageRating: null,
    volumeReference: null,
    weightedSuccess: rate === null ? 0 : rate * 100,
    weightedEligible: rate === null ? 0 : 100,
    volume: 10,
    activeDays: null,
    failureCount: metricKey === 'PUNCTUALITY' ? 2 : 0,
    failures:
      metricKey === 'PUNCTUALITY'
        ? [
            { appointmentId: '11111111-1111-1111-1111-111111111111', serviceDate: '2026-11-20', detail: 'Late 11:20' },
            { appointmentId: '22222222-2222-2222-2222-222222222222', serviceDate: '2026-11-21', detail: 'Late 10:10' },
          ]
        : [],
  };
}

function row(
  name: string,
  status: StoredReliabilitySnapshotRow['status'],
  score: number | null,
  volume: number,
  active = true,
  withMetrics = false,
): StoredReliabilitySnapshotRow {
  return {
    inspectorId: name.toLowerCase(),
    inspectorName: name,
    inspectorActive: active,
    snapshotDate: SNAP,
    windowFrom: '2026-11-01',
    windowTo: '2026-11-30',
    windowDays: 30,
    status,
    score,
    volume,
    completedCount: volume,
    metrics: withMetrics ? RELIABILITY_METRIC_KEYS.map((m) => metric(m, 0.9)) : [],
    settings: settings(),
    computedAt: new Date('2026-11-30T17:15:04.000Z'),
  };
}

const FULL = [
  row('Eva', 'SCORED', 100, 10),
  row('Fábio', 'SCORED', 97.5, 10),
  row('Dan', 'SCORED', 89.0, 10),
  row('Ana', 'SCORED', 88.3, 12, true, true),
  row('Ben', 'SCORED', 79.0, 10),
  row('Carla', 'INSUFFICIENT_VOLUME', null, 9, true, true),
];

function makeRepo(
  rows: StoredReliabilitySnapshotRow[],
  inspectors: Record<string, ReliabilityInspectorRef | null>,
): IReliabilitySnapshotRepository {
  return {
    withComputeTransaction: async (fn) => fn({} as never),
    acquireComputeLock: async () => {},
    listNonDeletedInspectorIds: async () => [],
    replaceForDate: async () => {},
    purgeOlderThanAndDeleted: async () => ({ count: 0, deletedInspectors: 0 }),
    findLatestSnapshotDate: async () => (rows.length ? SNAP : null),
    findRowsByDate: async () => rows,
    listActiveInspectorsWithoutRow: async () => [],
    findInspector: async (id) => inspectors[id] ?? null,
    findRowComputedAtForDate: async () => null,
    findReliabilitySettingsUpdatedAt: async () => null,
  };
}

function settingsReaderStub() {
  return { get: vi.fn(async () => resolvePlatformSettingValue('reliabilityIndex', null).value) } as never;
}

function authService() {
  return new AuthorizationService({ log: vi.fn() } as never);
}

const INSPECTORS: Record<string, ReliabilityInspectorRef> = {
  ana: { id: 'ana', name: 'Ana', active: true },
  carla: { id: 'carla', name: 'Carla', active: true },
};

describe('GetInspectorReliabilityUseCase', () => {
  it('returns the scored detail with weights, position and failures from the snapshot', async () => {
    const uc = new GetInspectorReliabilityUseCase(
      new ReliabilityIndexReader(makeRepo(FULL, INSPECTORS)),
      makeRepo(FULL, INSPECTORS),
      settingsReaderStub(),
      authService(),
    );
    const res = await uc.execute({ actor: actor('AM'), inspectorId: 'ana', now: new Date('2026-12-01T22:00:00Z') });
    expect(res).toMatchObject({ status: 'SCORED', score: 88.3, position: 4, rankedCount: 5, volume: 12 });
    expect(res.metrics).toHaveLength(8);
    const punctuality = res.metrics.find((m) => m.metric === 'PUNCTUALITY')!;
    expect(punctuality.weight).toBe(WEIGHTS.PUNCTUALITY);
    expect(punctuality.failures).toHaveLength(2);
    expect(res.volumeReference).toBe(9.5);
  });

  it('returns INSUFFICIENT_VOLUME with a null score/position but populated metrics', async () => {
    const uc = new GetInspectorReliabilityUseCase(
      new ReliabilityIndexReader(makeRepo(FULL, INSPECTORS)),
      makeRepo(FULL, INSPECTORS),
      settingsReaderStub(),
      authService(),
    );
    const res = await uc.execute({ actor: actor('OP'), inspectorId: 'carla' });
    expect(res).toMatchObject({ status: 'INSUFFICIENT_VOLUME', score: null, position: null });
    expect(res.metrics.length).toBeGreaterThan(0);
  });

  it('returns NOT_COMPUTED (empty metrics, volume 0) for an inspector without a row', async () => {
    const inspectors = { ...INSPECTORS, newbie: { id: 'newbie', name: 'New', active: true } };
    const uc = new GetInspectorReliabilityUseCase(
      new ReliabilityIndexReader(makeRepo(FULL, inspectors)),
      makeRepo(FULL, inspectors),
      settingsReaderStub(),
      authService(),
    );
    const res = await uc.execute({ actor: actor('AM'), inspectorId: 'newbie' });
    expect(res).toMatchObject({
      status: 'NOT_COMPUTED',
      score: null,
      position: null,
      volume: 0,
      volumeReference: null,
      snapshotDate: SNAP,
      minimumVolume: 10,
      minimumRatings: 3,
    });
    expect(res.metrics).toEqual([]);
  });

  it('returns an INACTIVE inspector that has a row, with position null', async () => {
    const rows = [...FULL, row('Gone', 'SCORED', 92, 10, false, true)];
    const inspectors = { ...INSPECTORS, gone: { id: 'gone', name: 'Gone', active: false } };
    const uc = new GetInspectorReliabilityUseCase(
      new ReliabilityIndexReader(makeRepo(rows, inspectors)),
      makeRepo(rows, inspectors),
      settingsReaderStub(),
      authService(),
    );
    const res = await uc.execute({ actor: actor('AM'), inspectorId: 'gone' });
    expect(res.inspectorStatus).toBe('INACTIVE');
    expect(res.position).toBeNull();
  });

  it('404s an unknown or soft-deleted inspector', async () => {
    const uc = new GetInspectorReliabilityUseCase(
      new ReliabilityIndexReader(makeRepo(FULL, INSPECTORS)),
      makeRepo(FULL, INSPECTORS),
      settingsReaderStub(),
      authService(),
    );
    await expect(uc.execute({ actor: actor('AM'), inspectorId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids CL and INSP actors before any read', async () => {
    for (const role of ['CL_ADMIN', 'CL_USER', 'INSP'] as UserRole[]) {
      const uc = new GetInspectorReliabilityUseCase(
        new ReliabilityIndexReader(makeRepo(FULL, INSPECTORS)),
        makeRepo(FULL, INSPECTORS),
        settingsReaderStub(),
        authService(),
      );
      await expect(uc.execute({ actor: actor(role), inspectorId: 'ana' })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
