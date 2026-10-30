import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseArgs,
  regeocodePermanent,
  stripLegacyFoundCoordinates,
  haversineMeters,
  isDirectInvocation,
  type RegeocodeDeps,
  type RegeocodeOptions,
} from './regeocode-permanent';
import { MapboxPermanentGeocodingUnavailableError } from '../modules/property/domain/geocoding.service';
import type { ILegacyRegeocodeRepository } from '../modules/property/domain/legacy-regeocode.repository';

const T = new Date('2026-10-01T00:00:00.000Z');

function makeRepo(overrides: Partial<ILegacyRegeocodeRepository> = {}): ILegacyRegeocodeRepository {
  return {
    findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([]),
    findLegacyBranchCandidates: vi.fn().mockResolvedValue([]),
    findManualWithTransitionAudit: vi.fn().mockResolvedValue([]),
    findAddressChangesAfter: vi.fn().mockResolvedValue({}),
    findImportPreviewsToStrip: vi.fn().mockResolvedValue([]),
    findAccountBlockedProperties: vi.fn().mockResolvedValue([]),
    applyPermanentBackfill: vi.fn().mockResolvedValue(true),
    markLegacyNoResult: vi.fn().mockResolvedValue(true),
    restoreFalseManual: vi.fn().mockResolvedValue(true),
    backfillBranchCoordinates: vi.fn().mockResolvedValue(true),
    replaceImportPreview: vi.fn().mockResolvedValue(undefined),
    requeueAccountBlocked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ILegacyRegeocodeRepository;
}

type GeocodeResult = { lat: number; lng: number } | null;

function makeDeps(
  repo: ILegacyRegeocodeRepository,
  geocode: (q: string, o?: { mode?: string }) => Promise<GeocodeResult>,
  isConfigured = true,
) {
  const geocodeFn = vi.fn(geocode);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const audit = vi.fn();
  const sleep = vi.fn().mockResolvedValue(undefined);
  const deps: RegeocodeDeps = {
    repo,
    geocoder: { geocode: geocodeFn as never },
    isGeocoderConfigured: vi.fn().mockResolvedValue(isConfigured),
    enqueue,
    auditService: { log: audit },
    sleep,
  };
  return { deps, geocode: geocodeFn, enqueue, audit, sleep };
}

const BASE_OPTS: RegeocodeOptions = {
  apply: false,
  entities: ['properties', 'branches', 'false-manual'],
  stripImportPreviews: false,
  retryFailedPermanent: false,
  falseManualToleranceM: 5,
  rate: 120,
  moveThresholdM: 25,
};
const opts = (o: Partial<RegeocodeOptions> = {}): RegeocodeOptions => ({ ...BASE_OPTS, ...o });

function prop(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    tenantId: 't1',
    propertyCode: `P-${id}`,
    lat: -33.8,
    lng: 151.2,
    street: '1 Main St',
    addressLine2: null,
    suburb: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    country: 'AU',
    updatedAt: T,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseArgs', () => {
  it('case 1: defaults', () => {
    const r = parseArgs([]);
    expect('options' in r).toBe(true);
    if ('options' in r) {
      expect(r.options).toEqual({
        apply: false,
        entities: ['properties', 'branches', 'false-manual'],
        stripImportPreviews: false,
        retryFailedPermanent: false,
        rate: 120,
        moveThresholdM: 25,
        falseManualToleranceM: 5,
      });
    }
  });

  it('case 2: --rate=0 is invalid', () => {
    expect(parseArgs(['--rate=0'])).toEqual({ error: 'Invalid argument: --rate=0', exitCode: 2 });
  });

  it('case 3: --retry-failed-permanent cannot combine with --strip-import-previews', () => {
    const r = parseArgs(['--retry-failed-permanent', '--strip-import-previews']);
    expect(r).toEqual({
      error: '--retry-failed-permanent cannot be combined with --strip-import-previews',
      exitCode: 2,
    });
  });

  it('case 14 (args): --retry combined with --entities is rejected', () => {
    const r = parseArgs(['--retry-failed-permanent', '--entities=properties']);
    expect('error' in r && r.error).toContain('cannot be combined with --entities');
  });

  it('invalid --limit / tolerance / move-threshold / unknown flag', () => {
    expect('error' in parseArgs(['--limit=-1'])).toBe(true);
    expect('error' in parseArgs(['--false-manual-tolerance-m=0'])).toBe(true);
    expect('error' in parseArgs(['--move-threshold-m=-1'])).toBe(true);
    expect(parseArgs(['--bogus'])).toEqual({ error: 'Invalid argument: --bogus', exitCode: 2 });
    expect('error' in parseArgs(['--entities=foo'])).toBe(true);
  });

  it('parses a full valid command', () => {
    const r = parseArgs(['--apply', '--tenant=abc', '--limit=20', '--rate=300', '--false-manual-tolerance-m=15']);
    expect('options' in r).toBe(true);
    if ('options' in r)
      expect(r.options).toMatchObject({ apply: true, tenantId: 'abc', limit: 20, rate: 300, falseManualToleranceM: 15 });
  });
});

describe('helpers', () => {
  it('haversine ~111m per 0.001 deg lat', () => {
    expect(haversineMeters(-33.8, 151.2, -33.801, 151.2)).toBeCloseTo(111, 0);
  });
  it('case 18: isDirectInvocation only matches this script', () => {
    expect(isDirectInvocation('/x/src/scripts/regeocode-permanent.ts')).toBe(true);
    expect(isDirectInvocation('/x/src/scripts/other.ts')).toBe(false);
    expect(isDirectInvocation(undefined)).toBe(false);
  });
});

describe('regeocodePermanent — safety & dry-run', () => {
  it('case 14: unconfigured geocoder aborts before any selection', async () => {
    const repo = makeRepo();
    const { deps } = makeDeps(repo, async () => null, false);
    const report = await regeocodePermanent(deps, opts({ apply: true }));
    expect(report.aborted).toEqual({ code: 'MAPBOX_NOT_CONFIGURED', atEntityId: null });
    expect(repo.findLegacyCoordinateCandidates).not.toHaveBeenCalled();
    expect(repo.findManualWithTransitionAudit).not.toHaveBeenCalled();
  });

  it('case 4: dry-run counts, no geocode, no write, estimatedRequests', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b'), prop('c')]),
      findLegacyBranchCandidates: vi.fn().mockResolvedValue([
        { id: 'b1', tenantId: 't1', name: 'B1', addressJson: { latitude: 0, longitude: 0 }, updatedAt: T },
        { id: 'b2', tenantId: 't1', name: 'B2', addressJson: { latitude: 0, longitude: 0 }, updatedAt: T },
      ]),
    });
    const { deps, geocode, audit } = makeDeps(repo, async () => ({ lat: 1, lng: 1 }));
    const report = await regeocodePermanent(deps, opts());
    expect(report.properties.scanned).toBe(3);
    expect(report.branches.scanned).toBe(2);
    expect(geocode).not.toHaveBeenCalled();
    expect(repo.applyPermanentBackfill).not.toHaveBeenCalled();
    expect(repo.backfillBranchCoordinates).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(report.estimatedRequests).toEqual({ falseManual: 0, properties: 3, branches: 2, total: 5 });
    expect(report.dryRun).toBe(true);
  });
});

describe('regeocodePermanent — property phase', () => {
  it('case 5: success writes with CAS args + permanent mode, updated:1 moved:0', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]),
    });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2001 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(geocode).toHaveBeenCalledWith('1 Main St, Parramatta, NSW, 2150, AU', { mode: 'permanent' });
    expect(repo.applyPermanentBackfill).toHaveBeenCalledWith(
      'a',
      't1',
      { lat: -33.8, lng: 151.2, updatedAt: T },
      { lat: -33.8001, lng: 151.2001 },
    );
    expect(report.properties.updated).toBe(1);
    expect(report.properties.moved).toBe(0);
  });

  it('case 6: a result ~100 m away counts as moved', async () => {
    const repo = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]) });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8009, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(report.properties.moved).toBe(1);
    expect(report.properties.updated).toBe(1);
  });

  it('case 7: null result → markLegacyNoResult, not applyPermanentBackfill, coord kept', async () => {
    const repo = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]) });
    const { deps } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(repo.markLegacyNoResult).toHaveBeenCalledWith('a', 't1', { lat: -33.8, lng: 151.2, updatedAt: T });
    expect(repo.applyPermanentBackfill).not.toHaveBeenCalled();
    expect(report.properties.noResult).toEqual([{ id: 'a', propertyCode: 'P-a', tenantId: 't1' }]);
  });

  it('case 8: a generic error is recorded and processing continues', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b')]),
    });
    const geocode = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ lat: -33.8001, lng: 151.2001 });
    const { deps } = makeDeps(repo, geocode as never);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(report.properties.errors).toHaveLength(1);
    expect(report.properties.errors[0]).toMatchObject({ id: 'a' });
    expect(report.properties.updated).toBe(1);
  });

  it('case 9: account error on 2nd row aborts; 1st kept, atEntityId=2nd', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b'), prop('c')]),
    });
    const geocode = vi
      .fn()
      .mockResolvedValueOnce({ lat: -33.8001, lng: 151.2001 })
      .mockRejectedValueOnce(new MapboxPermanentGeocodingUnavailableError());
    const { deps } = makeDeps(repo, geocode as never);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(report.aborted).toEqual({ code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE', atEntityId: 'b' });
    expect(repo.applyPermanentBackfill).toHaveBeenCalledTimes(1);
  });

  it('case 10: applyPermanentBackfill false → skippedConcurrent', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]),
      applyPermanentBackfill: vi.fn().mockResolvedValue(false),
    });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2001 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(report.properties.skippedConcurrent).toBe(1);
    expect(report.properties.updated).toBe(0);
  });

  it('case 13: rate 120 → sleep(500) between calls', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b')]),
    });
    const { deps, sleep } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2001 }));
    await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'], rate: 120 }));
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('case 33: 429 then success → sleep(60000) once, written, no error', async () => {
    const repo = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]) });
    const geocode = vi
      .fn()
      .mockRejectedValueOnce(new Error('Mapbox geocoding failed with status 429'))
      .mockResolvedValueOnce({ lat: -33.8001, lng: 151.2001 });
    const { deps, sleep } = makeDeps(repo, geocode as never);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(sleep).toHaveBeenCalledWith(60000);
    expect(report.properties.updated).toBe(1);
    expect(report.properties.errors).toHaveLength(0);
  });

  it('case 34: 429 twice → recorded in errors, continues', async () => {
    const repo = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b')]) });
    const geocode = vi
      .fn()
      .mockRejectedValueOnce(new Error('status 429'))
      .mockRejectedValueOnce(new Error('status 429'))
      .mockResolvedValueOnce({ lat: -33.8001, lng: 151.2001 });
    const { deps } = makeDeps(repo, geocode as never);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties'] }));
    expect(report.properties.errors).toHaveLength(1);
    expect(report.properties.updated).toBe(1);
  });

  it('case 35: --limit=1 applies per phase', async () => {
    const repo = makeRepo({
      findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a'), prop('b')]),
      findLegacyBranchCandidates: vi.fn().mockResolvedValue([
        { id: 'b1', tenantId: 't1', name: 'B1', addressJson: { latitude: 1, longitude: 1 }, updatedAt: T },
        { id: 'b2', tenantId: 't1', name: 'B2', addressJson: { latitude: 1, longitude: 1 }, updatedAt: T },
      ]),
    });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2001 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['properties', 'branches'], limit: 1 }));
    expect(report.properties.scanned).toBe(1);
    expect(report.branches.scanned).toBe(1);
  });

  it('case 17: audits on apply, none on dry-run', async () => {
    const repo = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]) });
    const applied = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2001 }));
    await regeocodePermanent(applied.deps, opts({ apply: true, entities: ['properties'] }));
    expect(applied.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.geocode_permanent_backfilled', actorType: 'SYSTEM', entityId: 'a', tenantId: 't1' }),
    );
    vi.clearAllMocks();
    const repo2 = makeRepo({ findLegacyCoordinateCandidates: vi.fn().mockResolvedValue([prop('a')]) });
    const dry = makeDeps(repo2, async () => ({ lat: -33.8001, lng: 151.2001 }));
    await regeocodePermanent(dry.deps, opts({ entities: ['properties'] }));
    expect(dry.audit).not.toHaveBeenCalled();
  });
});

describe('regeocodePermanent — branch phase', () => {
  const branch = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'b1',
    tenantId: 't1',
    name: 'Branch One',
    addressJson: { street: '1 Main St', suburb: 'Parramatta', city: 'Parramatta', state: 'NSW', postcode: '2150', country: 'AU', latitude: 0, longitude: 0 },
    updatedAt: T,
    ...over,
  });

  it('case 11: branch found → backfillBranchCoordinates(id, tenantId, {updatedAt}, {latitude, longitude})', async () => {
    const repo = makeRepo({ findLegacyBranchCandidates: vi.fn().mockResolvedValue([branch()]) });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.81, lng: 151.21 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['branches'] }));
    expect(geocode).toHaveBeenCalledWith('1 Main St, Parramatta, NSW, 2150, AU', { mode: 'permanent' });
    expect(repo.backfillBranchCoordinates).toHaveBeenCalledWith(
      'b1',
      't1',
      { updatedAt: T },
      { latitude: -33.81, longitude: 151.21 },
    );
    expect(report.branches.updated).toBe(1);
  });

  it('case 12: branch null → no write, noResult', async () => {
    const repo = makeRepo({ findLegacyBranchCandidates: vi.fn().mockResolvedValue([branch()]) });
    const { deps } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['branches'] }));
    expect(repo.backfillBranchCoordinates).not.toHaveBeenCalled();
    expect(report.branches.noResult).toEqual([{ id: 'b1', name: 'Branch One', tenantId: 't1' }]);
  });

  it('case 37: branch CAS false → skippedConcurrent, no audit', async () => {
    const repo = makeRepo({
      findLegacyBranchCandidates: vi.fn().mockResolvedValue([branch()]),
      backfillBranchCoordinates: vi.fn().mockResolvedValue(false),
    });
    const { deps, audit } = makeDeps(repo, async () => ({ lat: -33.81, lng: 151.21 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['branches'] }));
    expect(report.branches.skippedConcurrent).toBe(1);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('regeocodePermanent — import preview strip', () => {
  it('stripLegacyFoundCoordinates nulls only found-without-mode', () => {
    const json = {
      rows: [
        { property: { geocode: { status: 'found', lat: 1, lng: 2 } } },
        { property: { geocode: { status: 'found', lat: 3, lng: 4 } } },
        { property: { geocode: { status: 'found', lat: 5, lng: 6, mode: 'permanent' } } },
        { property: { geocode: { status: 'not_found', lat: null, lng: null } } },
      ],
    };
    const r = stripLegacyFoundCoordinates(json);
    expect(r.changed).toBe(true);
    const rows = (r.value as typeof json).rows;
    expect(rows[0]!.property.geocode).toBeNull();
    expect(rows[1]!.property.geocode).toBeNull();
    expect(rows[2]!.property.geocode).toMatchObject({ mode: 'permanent' });
    expect(rows[3]!.property.geocode).toMatchObject({ status: 'not_found' });
  });

  it('case 15: strip writes once with stripped:1', async () => {
    const preview = {
      rows: [
        { property: { geocode: { status: 'found', lat: 1, lng: 2 } } },
        { property: { geocode: { status: 'found', lat: 3, lng: 4 } } },
        { property: { geocode: { status: 'found', lat: 5, lng: 6, mode: 'permanent' } } },
        { property: { geocode: { status: 'not_found', lat: null, lng: null } } },
      ],
    };
    const repo = makeRepo({
      findImportPreviewsToStrip: vi.fn().mockResolvedValue([{ id: 'imp1', tenantId: 't1', previewJson: preview }]),
    });
    const { deps } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: [], stripImportPreviews: true }));
    expect(report.importPreviews).toEqual({ scanned: 1, stripped: 1 });
    expect(repo.replaceImportPreview).toHaveBeenCalledWith('imp1', 't1', expect.anything());
  });

  it('case 36: --tenant scopes strip and retry selections', async () => {
    const repoStrip = makeRepo();
    const s = makeDeps(repoStrip, async () => null);
    await regeocodePermanent(s.deps, opts({ apply: true, entities: [], stripImportPreviews: true, tenantId: 'X' }));
    expect(repoStrip.findImportPreviewsToStrip).toHaveBeenCalledWith(null, expect.any(Number), 'X');

    const repoRetry = makeRepo();
    const r = makeDeps(repoRetry, async () => null);
    await regeocodePermanent(r.deps, opts({ apply: true, retryFailedPermanent: true, tenantId: 'X' }));
    expect(repoRetry.findAccountBlockedProperties).toHaveBeenCalledWith(null, expect.any(Number), 'X');
  });
});

describe('regeocodePermanent — bulk retry', () => {
  it('case 16: requeues each blocked property and enqueues property.geocode', async () => {
    const repo = makeRepo({
      findAccountBlockedProperties: vi.fn().mockResolvedValue([
        { id: 'p1', tenantId: 't1' },
        { id: 'p2', tenantId: 't2' },
      ]),
    });
    const { deps, enqueue, audit } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ apply: true, retryFailedPermanent: true }));
    expect(repo.requeueAccountBlocked).toHaveBeenCalledTimes(2);
    expect(repo.requeueAccountBlocked).toHaveBeenCalledWith('p1', 't1');
    expect(enqueue).toHaveBeenCalledWith('property.geocode', { propertyId: 'p1' }, { retryLimit: 6, retryBackoff: true });
    expect(report.retriedFailedPermanent).toBe(2);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.geocode_retry_requeued', actorType: 'SYSTEM' }),
    );
    // retry never geocodes anything
    expect(repo.findLegacyCoordinateCandidates).not.toHaveBeenCalled();
  });

  it('retry dry-run counts but does not write/enqueue', async () => {
    const repo = makeRepo({
      findAccountBlockedProperties: vi.fn().mockResolvedValue([{ id: 'p1', tenantId: 't1' }]),
    });
    const { deps, enqueue } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ retryFailedPermanent: true }));
    expect(report.retriedFailedPermanent).toBe(1);
    expect(repo.requeueAccountBlocked).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('false manual detection', () => {
  const fm = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'm1',
    tenantId: 't1',
    propertyCode: 'P-m1',
    lat: -33.8,
    lng: 151.2,
    street: '1 Main St',
    addressLine2: null,
    suburb: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    country: 'AU',
    updatedAt: T,
    auditLogId: 'audit-1',
    transitionedAt: new Date('2026-09-01T00:00:00Z'),
    redactionStatus: 'NONE',
    beforeJson: { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', country: 'AU', geocodingStatus: 'SUCCESS' },
    afterJson: { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', country: 'AU', geocodingStatus: 'MANUAL' },
    ...over,
  });

  it('case 19: no audit → missingAudit, no geocode', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm({ auditLogId: null, transitionedAt: null })]) });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.missingAudit).toEqual([{ id: 'm1', propertyCode: 'P-m1', tenantId: 't1' }]);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('case 20: redacted audit → ambiguous audit_redacted', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm({ redactionStatus: 'REDACTED' })]) });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.ambiguous[0]).toMatchObject({ id: 'm1', reason: 'audit_redacted' });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('case 21: address changed in transition → ambiguous, no geocode', async () => {
    const repo = makeRepo({
      findManualWithTransitionAudit: vi.fn().mockResolvedValue([
        fm({ beforeJson: { street: '1 Old St', suburb: 'Parramatta', state: 'NSW', country: 'AU' }, afterJson: { street: '2 New St', suburb: 'Parramatta', state: 'NSW', country: 'AU' } }),
      ]),
    });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.ambiguous[0]).toMatchObject({ reason: 'address_changed_in_transition' });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('case 22: trimmed/case-insensitive equal address → candidate (geocoded)', async () => {
    const repo = makeRepo({
      findManualWithTransitionAudit: vi.fn().mockResolvedValue([
        fm({ beforeJson: { street: ' 1 Main St ', suburb: 'parramatta', state: 'nsw', country: 'au' }, afterJson: { street: '1 MAIN ST', suburb: 'Parramatta', state: 'NSW', country: 'AU' } }),
      ]),
    });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('case 23: candidate within tolerance → restored with audit distanceM/toleranceM', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps, audit } = makeDeps(repo, async () => ({ lat: -33.80002, lng: 151.20001 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(repo.restoreFalseManual).toHaveBeenCalledWith('m1', 't1', { lat: -33.8, lng: 151.2, updatedAt: T }, { lat: -33.80002, lng: 151.20001 });
    expect(report.falseManual.restored).toBe(1);
    const call = audit.mock.calls.find((c) => c[0].action === 'property.false_manual_restored');
    expect(call![0].metadata.toleranceM).toBe(5);
    expect(call![0].metadata.distanceM).toBeCloseTo(2.4, 0);
    expect(call![0].metadata.auditLogId).toBe('audit-1');
  });

  it('case 24: candidate beyond tolerance → coordinates_differ', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.ambiguous[0]).toMatchObject({ reason: 'coordinates_differ' });
    expect(report.falseManual.ambiguous[0]!.distanceM).toBeCloseTo(11.1, 0);
    expect(repo.restoreFalseManual).not.toHaveBeenCalled();
  });

  it('case 25: higher tolerance restores the 11 m point', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8001, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'], falseManualToleranceM: 15 }));
    expect(report.falseManual.restored).toBe(1);
  });

  it('case 26: null → no_result, MANUAL kept (no markLegacyNoResult)', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps } = makeDeps(repo, async () => null);
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.ambiguous[0]).toMatchObject({ reason: 'no_result' });
    expect(repo.markLegacyNoResult).not.toHaveBeenCalled();
    expect(repo.restoreFalseManual).not.toHaveBeenCalled();
  });

  it('case 27: generic error → geocode_error', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps } = makeDeps(repo, async () => { throw new Error('boom'); });
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.ambiguous[0]).toMatchObject({ reason: 'geocode_error' });
  });

  it('case 28: account error → aborts', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps } = makeDeps(repo, async () => { throw new MapboxPermanentGeocodingUnavailableError(); });
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.aborted).toEqual({ code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE', atEntityId: 'm1' });
  });

  it('case 29: restoreFalseManual false → skippedConcurrent', async () => {
    const repo = makeRepo({
      findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]),
      restoreFalseManual: vi.fn().mockResolvedValue(false),
    });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.80002, lng: 151.20001 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(report.falseManual.skippedConcurrent).toBe(1);
  });

  it('case 30/40: dry-run classification, estimatedRequests.falseManual = candidates, restored 0', async () => {
    const repo = makeRepo({
      findManualWithTransitionAudit: vi.fn().mockResolvedValue([
        fm({ id: 'noaudit', auditLogId: null, transitionedAt: null }),
        fm({ id: 'changed', beforeJson: { street: 'A', suburb: 'x', state: 'y', country: 'z' }, afterJson: { street: 'B', suburb: 'x', state: 'y', country: 'z' } }),
        fm({ id: 'cand1' }),
        fm({ id: 'cand2' }),
      ]),
    });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ entities: ['false-manual'] }));
    expect(report.falseManual.auditCandidates).toBe(2);
    expect(report.falseManual.missingAudit).toHaveLength(1);
    expect(report.falseManual.ambiguous).toHaveLength(1);
    expect(report.falseManual.restored).toBe(0);
    expect(report.estimatedRequests.falseManual).toBe(2);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('case 31: --entities without false-manual skips the audit query', async () => {
    const repo = makeRepo();
    const { deps } = makeDeps(repo, async () => ({ lat: -33.8, lng: 151.2 }));
    await regeocodePermanent(deps, opts({ apply: true, entities: ['properties', 'branches'] }));
    expect(repo.findManualWithTransitionAudit).not.toHaveBeenCalled();
  });

  it('case 32: candidate geocoded with formatGeocodingQuery + permanent mode', async () => {
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm()]) });
    const { deps, geocode } = makeDeps(repo, async () => ({ lat: -33.80002, lng: 151.20001 }));
    await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(geocode).toHaveBeenCalledWith('1 Main St, Parramatta, NSW, 2150, AU', { mode: 'permanent' });
  });

  it('case 38: addressChangedAfterTransition reflects findAddressChangesAfter', async () => {
    const repo = makeRepo({
      findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm({ id: 'c1' }), fm({ id: 'c2' })]),
      findAddressChangesAfter: vi.fn().mockResolvedValue({ c1: true, c2: false }),
    });
    // both beyond tolerance so both become ambiguous (coordinates_differ)
    const { deps } = makeDeps(repo, async () => ({ lat: -33.81, lng: 151.2 }));
    const report = await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    const c1 = report.falseManual.ambiguous.find((a) => a.id === 'c1')!;
    const c2 = report.falseManual.ambiguous.find((a) => a.id === 'c2')!;
    expect(c1.addressChangedAfterTransition).toBe(true);
    expect(c2.addressChangedAfterTransition).toBe(false);
  });

  it('case 39: restoreFalseManual receives expected.updatedAt from the row', async () => {
    const rowDate = new Date('2026-09-15T12:00:00Z');
    const repo = makeRepo({ findManualWithTransitionAudit: vi.fn().mockResolvedValue([fm({ updatedAt: rowDate })]) });
    const { deps } = makeDeps(repo, async () => ({ lat: -33.80002, lng: 151.20001 }));
    await regeocodePermanent(deps, opts({ apply: true, entities: ['false-manual'] }));
    expect(repo.restoreFalseManual).toHaveBeenCalledWith(
      'm1',
      't1',
      expect.objectContaining({ updatedAt: rowDate }),
      expect.anything(),
    );
  });
});
