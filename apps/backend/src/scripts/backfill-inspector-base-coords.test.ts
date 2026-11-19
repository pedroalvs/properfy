import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  backfillInspectorBaseCoords,
  MapboxNotConfiguredError,
  type BackfillDeps,
} from './backfill-inspector-base-coords';
import type { IGeocodingService } from '../modules/property/domain/geocoding.service';
import { MapboxPermanentGeocodingUnavailableError } from '../modules/property/domain/geocoding.service';

const VALID = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};
const FIXED = new Date('2026-10-30T00:00:00.000Z');

interface Row {
  id: string;
  address: unknown;
}

type GeocodeImpl = (
  address: string,
  options?: { mode?: 'permanent' | 'temporary' },
) => Promise<{ lat: number; lng: number } | null>;

function makeDeps(rows: Row[], geocode: GeocodeImpl) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const audit = vi.fn();
  const emit = vi.fn().mockResolvedValue(undefined);
  const sleep = vi.fn().mockResolvedValue(undefined);
  const geocodeFn = vi.fn((address: string, options?: { mode?: 'permanent' | 'temporary' }) =>
    geocode(address, options),
  );
  const deps: BackfillDeps = {
    prisma: { inspector: { findMany, updateMany } } as never,
    geocoder: { geocode: geocodeFn as unknown as IGeocodingService['geocode'] },
    isConfigured: vi.fn().mockResolvedValue(true),
    auditService: { log: audit },
    eventBus: { emit },
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    clock: { now: () => FIXED },
    sleep,
  };
  return { deps, findMany, updateMany, audit, emit, sleep, geocode: geocodeFn };
}

describe('backfillInspectorBaseCoords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dry run makes no geocoder call, no write, and reports estimatedRequests = toGeocode', async () => {
    const rows = [
      { id: 'a', address: VALID },
      { id: 'b', address: VALID },
      { id: 'c', address: VALID },
    ];
    const { deps, updateMany, geocode } = makeDeps(rows, async () => ({ lat: 1, lng: 2 }));
    const report = await backfillInspectorBaseCoords(deps, { apply: false });
    expect(geocode).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dryRun: true,
      scanned: 3,
      compatible: 3,
      toGeocode: 3,
      estimatedRequests: 3,
    });
    expect(report.geocoded).toBeUndefined();
    expect(report.notFound).toBeUndefined();
    expect(report.estimatedCostUsd).toBeCloseTo(0.015, 5);
  });

  it('dry run runs even when Mapbox is not configured (never checks isConfigured)', async () => {
    const { deps } = makeDeps([{ id: 'a', address: VALID }], async () => ({ lat: 1, lng: 2 }));
    deps.isConfigured = vi.fn().mockResolvedValue(false);
    const report = await backfillInspectorBaseCoords(deps, { apply: false });
    expect(report.dryRun).toBe(true);
    expect(deps.isConfigured).not.toHaveBeenCalled();
  });

  it('selects only unlocated rows, excluding DbNull and JsonNull addresses', async () => {
    const { deps, findMany } = makeDeps([], async () => null);
    await backfillInspectorBaseCoords(deps, { apply: false });
    const where = findMany.mock.calls[0]![0].where;
    expect(where.base_lat).toBeNull();
    expect(where.deleted_at).toBeNull();
    expect(where.AND).toEqual([
      { address: { not: Prisma.DbNull } },
      { address: { not: Prisma.JsonNull } },
    ]);
  });

  it('lists a legacy spelled-out-state address as incompatible with the Zod issue path', async () => {
    const { deps } = makeDeps(
      [{ id: 'legacy', address: { ...VALID, state: 'New South Wales' } }],
      async () => ({ lat: 1, lng: 2 }),
    );
    const report = await backfillInspectorBaseCoords(deps, { apply: false });
    expect(report.compatible).toBe(0);
    expect(report.incompatible).toHaveLength(1);
    const inc = report.incompatible[0]!;
    expect(inc.inspectorId).toBe('legacy');
    expect(inc.issues.some((i) => i.path[0] === 'state')).toBe(true);
  });

  it('apply geocodes, writes coords without rewriting address, audits without lat/lng, emits event', async () => {
    const { deps, updateMany, audit, emit } = makeDeps(
      [{ id: 'a', address: VALID }],
      async () => ({ lat: -33.86, lng: 151.2 }),
    );
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'a', base_lat: null },
      data: { base_lat: -33.86, base_lng: 151.2, base_geocoded_at: FIXED },
    });
    // address is never rewritten
    expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('address');
    expect(report.geocoded).toBe(1);
    expect(report.estimatedRequests).toBe(1);

    const auditEntry = audit.mock.calls[0]![0];
    expect(auditEntry.action).toBe('inspector.base_geocoded');
    expect(auditEntry.actorType).toBe('SYSTEM');
    expect(auditEntry.after).toEqual({ baseLocated: true, baseGeocodedAt: FIXED });
    expect(auditEntry.metadata).toEqual({ source: 'backfill' });
    expect(JSON.stringify(auditEntry)).not.toContain('151.2');

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0].payload).toMatchObject({ hadCoordinates: false, hasCoordinates: true });
  });

  it('lists an incompatible {foo:1} address and never geocodes it', async () => {
    const { deps, geocode } = makeDeps([{ id: 'x', address: { foo: 1 } }], async () => ({ lat: 1, lng: 2 }));
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(report.incompatible).toHaveLength(1);
    expect(report.compatible).toBe(0);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('maps a null geocoder result to notFound', async () => {
    const { deps } = makeDeps([{ id: 'a', address: VALID }], async () => null);
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(report.notFound).toEqual(['a']);
    expect(report.geocoded).toBe(0);
  });

  it('counts a thrown geocoder error as failed and continues to the next row', async () => {
    let call = 0;
    const { deps } = makeDeps(
      [{ id: 'a', address: VALID }, { id: 'b', address: VALID }],
      async () => {
        call++;
        if (call === 1) throw new Error('boom');
        return { lat: 1, lng: 2 };
      },
    );
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(report.failed).toEqual([{ inspectorId: 'a', reason: 'error' }]);
    expect(report.geocoded).toBe(1);
  });

  it('aborts the whole run with a non-zero-style throw on MapboxPermanentGeocodingUnavailableError', async () => {
    const { deps, updateMany } = makeDeps([{ id: 'a', address: VALID }], async () => {
      throw new MapboxPermanentGeocodingUnavailableError();
    });
    await expect(backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 })).rejects.toThrow(
      'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('apply with no Mapbox config aborts before reading any rows', async () => {
    const { deps, findMany } = makeDeps([{ id: 'a', address: VALID }], async () => ({ lat: 1, lng: 2 }));
    deps.isConfigured = vi.fn().mockResolvedValue(false);
    await expect(backfillInspectorBaseCoords(deps, { apply: true })).rejects.toThrow(MapboxNotConfiguredError);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('respects --delay-ms between (but not after) geocode calls', async () => {
    const { deps, sleep } = makeDeps(
      [{ id: 'a', address: VALID }, { id: 'b', address: VALID }],
      async () => ({ lat: 1, lng: 2 }),
    );
    await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 250 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('counts a CAS miss (count 0) as skippedConcurrent', async () => {
    const { deps, updateMany } = makeDeps([{ id: 'a', address: VALID }], async () => ({ lat: 1, lng: 2 }));
    updateMany.mockResolvedValue({ count: 0 });
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(report.skippedConcurrent).toBe(1);
    expect(report.geocoded).toBe(0);
  });

  it('is idempotent: a re-run over already-located rows (none selected) does nothing', async () => {
    const { deps, geocode, updateMany } = makeDeps([], async () => ({ lat: 1, lng: 2 }));
    const report = await backfillInspectorBaseCoords(deps, { apply: true, delayMs: 0 });
    expect(report.scanned).toBe(0);
    expect(geocode).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
