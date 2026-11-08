import { describe, expect, it } from 'vitest';
import { ReliabilityIndexReader } from './reliability-index.reader';
import type { StoredReliabilitySnapshotRow } from '../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository, ReliabilityInspectorRef } from '../domain/reliability-snapshot.repository';

const SNAP = '2026-12-01';

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

function fakeRepo(rows: StoredReliabilitySnapshotRow[], withoutRow: ReliabilityInspectorRef[] = []): IReliabilitySnapshotRepository {
  return {
    withComputeTransaction: async (fn) => fn({} as never),
    acquireComputeLock: async () => {},
    listNonDeletedInspectorIds: async () => [],
    replaceForDate: async () => {},
    purgeOlderThanAndDeleted: async () => ({ count: 0, deletedInspectors: 0 }),
    findLatestSnapshotDate: async () => (rows.length || withoutRow.length ? SNAP : null),
    findRowsByDate: async () => rows,
    listActiveInspectorsWithoutRow: async () => withoutRow,
    findInspector: async () => null,
    findRowComputedAtForDate: async () => null,
    findReliabilitySettingsUpdatedAt: async () => null,
  };
}

const FULL = [
  row('Eva', 'SCORED', 100, 10),
  row('Fábio', 'SCORED', 97.5, 10),
  row('Dan', 'SCORED', 89.0, 10),
  row('Ana', 'SCORED', 88.3, 12),
  row('Ben', 'SCORED', 79.0, 10),
  row('Carla', 'INSUFFICIENT_VOLUME', null, 9),
];

describe('ReliabilityIndexReader.getCurrentIndexes', () => {
  it('keeps the platform-wide position when filtered to a subset (Ana is 4, not 1)', async () => {
    const reader = new ReliabilityIndexReader(fakeRepo(FULL));
    const [ana] = await reader.getCurrentIndexes(['ana']);
    expect(ana).toMatchObject({ inspectorId: 'ana', position: 4, score: 88.3, status: 'SCORED', snapshotDate: SNAP });
  });

  it('returns every inspector with positions matching the full ranking', async () => {
    const reader = new ReliabilityIndexReader(fakeRepo(FULL));
    const all = await reader.getCurrentIndexes();
    const byId = new Map(all.map((e) => [e.inspectorId, e]));
    expect(byId.get('eva')?.position).toBe(1);
    expect(byId.get('fábio')?.position).toBe(2);
    expect(byId.get('dan')?.position).toBe(3);
    expect(byId.get('ana')?.position).toBe(4);
    expect(byId.get('ben')?.position).toBe(5);
    expect(byId.get('carla')).toMatchObject({ position: null, status: 'INSUFFICIENT_VOLUME' });
  });

  it('reports an inspector with no row as NOT_COMPUTED with the latest snapshotDate', async () => {
    const reader = new ReliabilityIndexReader(fakeRepo(FULL, [{ id: 'new', name: 'New Hire', active: true }]));
    const [created] = await reader.getCurrentIndexes(['new']);
    expect(created).toMatchObject({ inspectorId: 'new', status: 'NOT_COMPUTED', position: null, volume: 0, snapshotDate: SNAP });
  });

  it('reports NOT_COMPUTED with a null snapshotDate when there is no snapshot at all', async () => {
    const reader = new ReliabilityIndexReader(fakeRepo([]));
    const [x] = await reader.getCurrentIndexes(['x']);
    expect(x).toMatchObject({ inspectorId: 'x', status: 'NOT_COMPUTED', position: null, snapshotDate: null });
  });
});
