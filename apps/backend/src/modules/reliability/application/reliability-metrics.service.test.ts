import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RELIABILITY_INDEX,
  type PlatformSettingKey,
  type PlatformSettingValue,
  type ReliabilityIndexSetting,
} from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import { ReliabilityMetricsService } from './reliability-metrics.service';
import type {
  IReliabilityFactsReader,
  ReliabilityCivilRange,
  ReliabilityDoneRow,
  ReliabilityFactsRaw,
} from '../domain/reliability-facts.reader';

const FROM = '2026-11-01';
const TO = '2026-11-30';

function doneRow(inspectorId: string, over: Partial<ReliabilityDoneRow> = {}): ReliabilityDoneRow {
  return {
    appointmentId: `appt-${inspectorId}-${Math.random().toString(36).slice(2)}`,
    inspectorId,
    tenantId: 'tenant-1',
    timezone: 'Australia/Sydney',
    scheduledDate: '2026-11-10',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    defaultDurationMinutes: 60,
    inspectorCreatedAt: new Date('2026-01-01T00:00:00Z'),
    serviceDate: '2026-11-10',
    origin: 'CURRENT_DONE',
    doneRejected: false,
    rejectedOn: null,
    startedAt: new Date('2026-11-09T22:30:00Z'),
    startClientAt: null,
    finishedAt: new Date('2026-11-09T23:30:00Z'),
    resumedAt: null,
    outOfWindow: false,
    outOfRadius: false,
    finishOutOfRadius: false,
    geolocationDistanceMeters: 50,
    finishGeolocationDistanceMeters: 50,
    startAccuracyM: 20,
    finishAccuracyM: 20,
    geofenceRadiusM: 300,
    ...over,
  };
}

const lateRow = (inspectorId: string) =>
  doneRow(inspectorId, { outOfWindow: true, startedAt: new Date('2026-11-10T00:40:00Z') });

const punctual = (inspectorId: string, n: number) => Array.from({ length: n }, () => doneRow(inspectorId));

// Population: Ana 12 (10 punctual + 2 late), Ben 10, Carla 9, Dan 8, Eva 10, Fábio 9 → median 9.5
function population(): ReliabilityDoneRow[] {
  return [
    ...punctual('ana', 10),
    lateRow('ana'),
    lateRow('ana'),
    ...punctual('ben', 10),
    ...punctual('carla', 9),
    ...punctual('dan', 8),
    ...punctual('eva', 10),
    ...punctual('fabio', 9),
  ];
}

class FakeReader implements IReliabilityFactsReader {
  loadCalls: ReliabilityCivilRange[] = [];
  completedCountsCalls = 0;

  constructor(private readonly allDone: ReliabilityDoneRow[]) {}

  private rawFor(range: ReliabilityCivilRange): ReliabilityFactsRaw {
    const done = range.inspectorIds
      ? this.allDone.filter((r) => range.inspectorIds!.includes(r.inspectorId))
      : this.allDone;
    return { done, cantAttend: [], noShow: [], planStops: [], surveys: [], lateNotices: [] };
  }

  async load(range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw> {
    this.loadCalls.push(range);
    return this.rawFor(range);
  }

  async loadWith(_tx: unknown, range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw> {
    return this.load(range);
  }

  private counts(): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of this.allDone) map.set(row.inspectorId, (map.get(row.inspectorId) ?? 0) + 1);
    return map;
  }

  async loadCompletedCounts(): Promise<Map<string, number>> {
    this.completedCountsCalls += 1;
    return this.counts();
  }

  async loadCompletedCountsWith(): Promise<Map<string, number>> {
    return this.loadCompletedCounts();
  }
}

class FakeSettings implements IPlatformSettingsReader {
  getCalls: PlatformSettingKey[] = [];

  constructor(private readonly overrideReliability: Partial<ReliabilityIndexSetting> = {}) {}

  async get<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> {
    this.getCalls.push(key);
    if (key === 'reliabilityIndex') {
      return { ...DEFAULT_RELIABILITY_INDEX, ...this.overrideReliability } as PlatformSettingValue<K>;
    }
    if (key === 'fieldEvents') {
      return { checkInWindowToleranceMinutes: 15 } as unknown as PlatformSettingValue<K>;
    }
    throw new Error(`unexpected key ${key}`);
  }
}

function makeService(reader: FakeReader, settings: FakeSettings) {
  return new ReliabilityMetricsService(reader, settings);
}

describe('ReliabilityMetricsService.computeMetric', () => {
  it('loads only the inspector and returns the Ana PUNCTUALITY rate, without loadCompletedCounts', async () => {
    const reader = new FakeReader(population());
    const service = makeService(reader, new FakeSettings());
    const result = await service.computeMetric('PUNCTUALITY', 'ana', FROM, TO);
    expect(result.rate).toBe(0.8333);
    expect(reader.loadCalls[0]).toEqual({ from: FROM, to: TO, inspectorIds: ['ana'] });
    expect(reader.completedCountsCalls).toBe(0);
  });

  it('loadCompletedCounts once for VOLUME and gets the median 9.5', async () => {
    const reader = new FakeReader(population());
    const service = makeService(reader, new FakeSettings());
    const result = await service.computeMetric('VOLUME', 'ana', FROM, TO);
    expect(reader.completedCountsCalls).toBe(1);
    expect(result.volumeReference).toBe(9.5);
    expect(result.rate).toBe(1); // 12 / 9.5 capped
  });

  it('skips loadCompletedCounts for VOLUME when an override is set (rate 12/20 = 0.6)', async () => {
    const reader = new FakeReader(population());
    const service = makeService(reader, new FakeSettings({ volumeReferenceOverride: 20 }));
    const result = await service.computeMetric('VOLUME', 'ana', FROM, TO);
    expect(reader.completedCountsCalls).toBe(0);
    expect(result.volumeReference).toBe(20);
    expect(result.rate).toBe(0.6);
  });

  it('returns null metrics (VOLUME rate 0) and volume 0 for an inspector with no service', async () => {
    const reader = new FakeReader(population());
    const service = makeService(reader, new FakeSettings());
    const punctuality = await service.computeMetric('PUNCTUALITY', 'nobody', FROM, TO);
    const volume = await service.computeMetric('VOLUME', 'nobody', FROM, TO);
    expect(punctuality.rate).toBeNull();
    expect(punctuality.volume).toBe(0);
    expect(volume.rate).toBe(0);
  });

  it('throws RangeError on from > to and on an invalid date', async () => {
    const service = makeService(new FakeReader([]), new FakeSettings());
    await expect(service.computeMetric('VOLUME', 'ana', TO, FROM)).rejects.toThrow(RangeError);
    await expect(service.computeMetric('VOLUME', 'ana', '2026-13-01', TO)).rejects.toThrow(RangeError);
  });
});

describe('ReliabilityMetricsService.computeAll', () => {
  it('runs one unfiltered load, derives the median from facts, one entry per active inspector', async () => {
    const reader = new FakeReader(population());
    const settings = new FakeSettings();
    const batch = await makeService(reader, settings).computeAll(FROM, TO);
    expect(reader.loadCalls).toHaveLength(1);
    expect(reader.loadCalls[0]?.inspectorIds).toBeUndefined();
    expect(reader.completedCountsCalls).toBe(0);
    expect(batch.volumeReference).toMatchObject({ value: 9.5, source: 'MEDIAN', activeInspectors: 6 });
    expect([...batch.byInspector.keys()].sort()).toEqual(['ana', 'ben', 'carla', 'dan', 'eva', 'fabio']);
    expect(batch.byInspector.get('ana')?.volume).toBe(12);
    expect(batch.byInspector.get('ana')?.completedCount).toBe(12);
    expect(batch.byInspector.get('ana')?.metrics).toHaveLength(8);
    // reliabilityIndex + fieldEvents each read once
    expect(settings.getCalls.filter((k) => k === 'reliabilityIndex')).toHaveLength(1);
    expect(settings.getCalls.filter((k) => k === 'fieldEvents')).toHaveLength(1);
  });

  it('loadCompletedCounts once when filtered by inspectorIds', async () => {
    const reader = new FakeReader(population());
    const batch = await makeService(reader, new FakeSettings()).computeAll(FROM, TO, ['ana']);
    expect(reader.completedCountsCalls).toBe(1);
    expect(batch.volumeReference.value).toBe(9.5);
    expect([...batch.byInspector.keys()]).toEqual(['ana']);
  });

  it('scales an override by the period (L-F07-09): 20 over 7 days → 4.5, Ana 4 DONE → 0.8889', async () => {
    const reader = new FakeReader([...punctual('ana', 4)]);
    const service = makeService(reader, new FakeSettings({ volumeReferenceOverride: 20 }));
    const batch = await service.computeAll('2026-11-02', '2026-11-08');
    expect(batch.volumeReference).toMatchObject({ value: 4.5, source: 'OVERRIDE', periodDays: 7 });
    const volume = batch.byInspector.get('ana')?.metrics.find((m) => m.metric === 'VOLUME');
    expect(volume?.rate).toBe(0.8889);
  });

  it('supports 1-day and 92-day periods', async () => {
    const reader = new FakeReader(population());
    const service = makeService(reader, new FakeSettings());
    await expect(service.computeAll('2026-11-10', '2026-11-10')).resolves.toBeDefined();
    await expect(service.computeAll('2026-10-01', '2026-12-31')).resolves.toBeDefined();
  });
});
