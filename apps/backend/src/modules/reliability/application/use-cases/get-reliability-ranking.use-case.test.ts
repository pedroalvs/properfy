import { describe, expect, it, vi } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { resolvePlatformSettingValue } from '@properfy/shared';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { ReliabilityIndexReader } from '../reliability-index.reader';
import { GetReliabilityRankingUseCase } from './get-reliability-ranking.use-case';
import type { StoredReliabilitySnapshotRow } from '../../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository } from '../../domain/reliability-snapshot.repository';

const SNAP = '2026-12-01';

function actor(role: UserRole): AuthContext {
  return { userId: `u-${role}`, tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null };
}

function row(name: string, status: StoredReliabilitySnapshotRow['status'], score: number | null, volume: number): StoredReliabilitySnapshotRow {
  return {
    inspectorId: name.toLowerCase(),
    inspectorName: name,
    inspectorActive: true,
    snapshotDate: SNAP,
    windowFrom: '2026-11-01',
    windowTo: '2026-11-30',
    windowDays: 30,
    status,
    score,
    volume,
    completedCount: volume,
    metrics: [],
    settings: {
      weights: {} as never,
      minimumVolume: 10,
      minimumRatings: 3,
      toleranceMinutes: 15,
      volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 },
    },
    computedAt: new Date('2026-11-30T17:15:04.000Z'),
  };
}

function makeRepo(
  rows: StoredReliabilitySnapshotRow[],
  settingsUpdatedAt: Date | null = null,
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
    findInspector: async () => null,
    findRowComputedAtForDate: async () => null,
    findReliabilitySettingsUpdatedAt: async () => settingsUpdatedAt,
  };
}

const throwingRepo: IReliabilitySnapshotRepository = new Proxy({} as IReliabilitySnapshotRepository, {
  get() {
    return () => {
      throw new Error('repository must not be read for a forbidden actor');
    };
  },
});

function settingsReaderStub() {
  return { get: vi.fn(async () => resolvePlatformSettingValue('reliabilityIndex', null).value) } as never;
}

function makeAuth() {
  const audit = { log: vi.fn() };
  return { authService: new AuthorizationService(audit as never), audit };
}

const FULL = [
  row('Eva', 'SCORED', 100, 10),
  row('Fábio', 'SCORED', 97.5, 10),
  row('Dan', 'SCORED', 89.0, 10),
  row('Ana', 'SCORED', 88.3, 12),
  row('Ben', 'SCORED', 79.0, 10),
  row('Carla', 'INSUFFICIENT_VOLUME', null, 9),
];

describe('GetReliabilityRankingUseCase', () => {
  it('returns the ranking for AM and OP', async () => {
    const uc = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(makeRepo(FULL)), settingsReaderStub(), makeAuth().authService);
    for (const role of ['AM', 'OP'] as UserRole[]) {
      const res = await uc.execute({ actor: actor(role), now: new Date('2026-12-01T22:00:00Z') });
      expect(res.ranked.map((r) => r.inspectorName)).toEqual(['Eva', 'Fábio', 'Dan', 'Ana', 'Ben']);
      expect(res.notEnoughData).toEqual([{ inspectorId: 'carla', inspectorName: 'Carla', volume: 9, status: 'INSUFFICIENT_VOLUME' }]);
      expect(res.volumeReference).toBe(9.5);
      expect(res.volumeReferenceSource).toBe('MEDIAN');
      expect(res.minimumVolume).toBe(10);
    }
  });

  it('forbids CL_ADMIN, CL_USER and INSP with an audited 403 and no repository read', async () => {
    for (const role of ['CL_ADMIN', 'CL_USER', 'INSP'] as UserRole[]) {
      const { authService, audit } = makeAuth();
      const uc = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(throwingRepo), settingsReaderStub(), authService);
      await expect(uc.execute({ actor: actor(role) })).rejects.toBeInstanceOf(ForbiddenError);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'authorization.denied', metadata: expect.objectContaining({ attemptedAction: 'reliability.view' }) }),
      );
    }
  });

  it('returns an empty payload with the current minimumVolume when no snapshot exists', async () => {
    const uc = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(makeRepo([])), settingsReaderStub(), makeAuth().authService);
    const res = await uc.execute({ actor: actor('AM') });
    expect(res).toMatchObject({
      snapshotDate: null,
      windowFrom: null,
      windowTo: null,
      computedAt: null,
      isStale: false,
      settingsUpdatedAt: null,
      minimumVolume: 10,
      volumeReference: null,
      volumeReferenceSource: null,
      ranked: [],
      notEnoughData: [],
    });
  });

  it('marks the ranking stale when the snapshot is older than today (Sydney)', async () => {
    const uc = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(makeRepo(FULL)), settingsReaderStub(), makeAuth().authService);
    // 2026-12-02 09:00 Sydney → today is 2026-12-02, snapshot is 2026-12-01 → stale
    const stale = await uc.execute({ actor: actor('AM'), now: new Date('2026-12-01T22:00:00Z') });
    expect(stale.isStale).toBe(true);
    // 2026-12-02 03:00 Sydney (before the job) → still stale (snapshotDate < today)
    const earlyStale = await uc.execute({ actor: actor('AM'), now: new Date('2026-12-01T16:00:00Z') });
    expect(earlyStale.isStale).toBe(true);
  });

  it('is not stale when the snapshot is today', async () => {
    const todayRows = FULL.map((r) => ({ ...r, snapshotDate: '2026-12-02' }));
    const repo = makeRepo(todayRows);
    repo.findLatestSnapshotDate = async () => '2026-12-02';
    const uc = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(repo), settingsReaderStub(), makeAuth().authService);
    const res = await uc.execute({ actor: actor('AM'), now: new Date('2026-12-01T22:00:00Z') });
    expect(res.isStale).toBe(false);
  });

  it('exposes settingsUpdatedAt as the reliabilityIndex updated_at (or null)', async () => {
    const ts = new Date('2026-12-02T00:40:00.000Z');
    const withTs = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(makeRepo(FULL, ts)), settingsReaderStub(), makeAuth().authService);
    expect((await withTs.execute({ actor: actor('AM') })).settingsUpdatedAt).toBe(ts.toISOString());
    const noTs = new GetReliabilityRankingUseCase(new ReliabilityIndexReader(makeRepo(FULL, null)), settingsReaderStub(), makeAuth().authService);
    expect((await noTs.execute({ actor: actor('AM') })).settingsUpdatedAt).toBeNull();
  });
});
