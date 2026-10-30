/**
 * Real-Postgres/PostGIS coverage for the legacy permanent re-geocoding script
 * (`src/scripts/regeocode-permanent.ts`, TASK-X02-2).
 *
 * The invariants that only a live database proves:
 *   - the PostGIS `coordinates` column stays in lockstep with lat/lng on every
 *     write (CA2), and `markLegacyNoResult` leaves it untouched (CA3);
 *   - the compare-and-set on `updated_at` skips a row (or branch) edited
 *     between selection and write (CA12) — driven here by a fake geocoder that
 *     mutates the row mid-flight;
 *   - the branch jsonb merge changes only latitude/longitude (CA12);
 *   - idempotency: a second run selects nothing (CA1);
 *   - the false-MANUAL audit query + two-proof classification against real
 *     `audit_logs` rows (CA8/CA11);
 *   - the import-preview strip and bulk retry against real rows (CA4/CA5).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  regeocodePermanent,
  type RegeocodeDeps,
  type RegeocodeOptions,
} from '../../../src/scripts/regeocode-permanent';
import type { GeocodingResult } from '../../../src/modules/property/domain/geocoding.service';

let harness: DbHarness;
let repo: PrismaPropertyRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaPropertyRepository(harness.prisma);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

const BASE_OPTS: RegeocodeOptions = {
  apply: true,
  entities: ['properties', 'branches', 'false-manual'],
  stripImportPreviews: false,
  retryFailedPermanent: false,
  falseManualToleranceM: 5,
  rate: 120,
  moveThresholdM: 25,
};

function deps(
  geocode: (q: string) => Promise<GeocodingResult | null>,
  extra: Partial<RegeocodeDeps> = {},
): { deps: RegeocodeDeps; audits: Array<Record<string, unknown>>; enqueued: Array<{ name: string; data: object }> } {
  const audits: Array<Record<string, unknown>> = [];
  const enqueued: Array<{ name: string; data: object }> = [];
  return {
    audits,
    enqueued,
    deps: {
      repo,
      geocoder: { geocode: (q) => geocode(q) },
      isGeocoderConfigured: async () => true,
      enqueue: async (name, data) => {
        enqueued.push({ name, data });
      },
      auditService: { log: (e) => audits.push(e as unknown as Record<string, unknown>) },
      sleep: async () => undefined,
      ...extra,
    },
  };
}

async function seedTenant(label: string): Promise<string> {
  const t = await harness.prisma.tenant.create({
    data: { name: `${label}-${crypto.randomUUID().slice(0, 8)}`, legal_name: `${label} LLC`, status: 'ACTIVE' },
  });
  return t.id;
}

async function seedProperty(
  tenantId: string,
  over: Partial<ConstructorParameters<typeof PropertyEntity>[0]>,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await repo.save(
    new PropertyEntity({
      id,
      tenantId,
      branchId: null,
      propertyCode: `P-${crypto.randomUUID().slice(0, 8)}`,
      type: 'HOUSE',
      street: `${crypto.randomUUID().slice(0, 8)} Ocean St`,
      addressLine2: null,
      suburb: 'Kogarah',
      postcode: '2217',
      state: 'NSW',
      country: 'AU',
      lat: null,
      lng: null,
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...over,
    }),
  );
  return id;
}

async function readRow(id: string) {
  const rows = await harness.prisma.$queryRaw<
    Array<{ x: number | null; y: number | null; marker: Date | null; code: string | null; status: string; lat: unknown; lng: unknown }>
  >`
    SELECT ST_X(coordinates) AS x, ST_Y(coordinates) AS y,
           geocoded_permanently_at AS marker, geocoding_failure_code AS code,
           geocoding_status AS status, lat, lng
    FROM properties WHERE id = ${id}
  `;
  return rows[0]!;
}

describe('regeocode-permanent (real DB)', () => {
  it('#1/#3: re-geocodes only legacy rows, syncs PostGIS, and is idempotent on a second run', async () => {
    const tenantId = await seedTenant('T-geo');
    const legacySuccess = await seedProperty(tenantId, { lat: -33.0, lng: 151.0, geocodingStatus: 'SUCCESS' });
    const withMarker = await seedProperty(tenantId, {
      lat: -33.1, lng: 151.1, geocodingStatus: 'SUCCESS', geocodedPermanentlyAt: new Date(),
    });
    const pendingWithLat = await seedProperty(tenantId, { lat: -33.2, lng: 151.2, geocodingStatus: 'PENDING' });
    const failedWithLat = await seedProperty(tenantId, { lat: -33.3, lng: 151.3, geocodingStatus: 'FAILED' });
    const manual = await seedProperty(tenantId, { lat: -33.4, lng: 151.4, geocodingStatus: 'MANUAL' });
    const softDeleted = await seedProperty(tenantId, { lat: -33.5, lng: 151.5, geocodingStatus: 'SUCCESS' });
    // `save` (the create path) does not persist deleted_at, so soft-delete explicitly.
    await harness.prisma.property.update({ where: { id: softDeleted }, data: { deleted_at: new Date() } });
    const noLat = await seedProperty(tenantId, { geocodingStatus: 'FAILED' });
    const branchId = (
      await harness.prisma.branch.create({
        data: {
          tenant_id: tenantId, name: 'North', status: 'ACTIVE',
          address_json: { street: '9 Pitt St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU', latitude: 0, longitude: 0, provider: 'legacy' },
        },
      })
    ).id;

    const target: GeocodingResult = { lat: -34.9, lng: 150.9 };
    const run = deps(async () => target);
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, tenantId });

    // Only the four legacy rows + the branch change.
    expect(report.properties.updated).toBe(3); // legacySuccess, pendingWithLat, failedWithLat
    expect(report.branches.updated).toBe(1);

    for (const id of [legacySuccess, pendingWithLat, failedWithLat]) {
      const row = await readRow(id);
      expect(row.status).toBe('SUCCESS');
      expect(row.marker).not.toBeNull();
      expect(row.x).toBeCloseTo(150.9, 5);
      expect(row.y).toBeCloseTo(-34.9, 5);
    }
    // Untouched rows keep their original state.
    expect((await readRow(withMarker)).y).toBeCloseTo(-33.1, 5);
    expect((await readRow(manual)).status).toBe('MANUAL');
    expect((await readRow(softDeleted)).y).toBeCloseTo(-33.5, 5);
    expect((await readRow(noLat)).lat).toBeNull();

    const branch = await harness.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const addr = branch.address_json as Record<string, unknown>;
    expect(addr['latitude']).toBeCloseTo(-34.9, 5);
    expect(addr['longitude']).toBeCloseTo(150.9, 5);
    expect(addr['street']).toBe('9 Pitt St'); // merge preserved the address
    expect(addr['provider']).toBe('legacy');
    expect(branch.geocoded_permanently_at).not.toBeNull();

    // #3: second run finds nothing.
    const second = deps(async () => target);
    const report2 = await regeocodePermanent(second.deps, { ...BASE_OPTS, tenantId });
    expect(report2.properties.scanned).toBe(0);
    expect(report2.branches.scanned).toBe(0);
  });

  it('#2: null result → FAILED + LEGACY_PERMANENT_NO_RESULT, coordinates preserved', async () => {
    const tenantId = await seedTenant('T-noresult');
    const id = await seedProperty(tenantId, { lat: -33.7, lng: 151.7, geocodingStatus: 'SUCCESS' });
    const before = await readRow(id);

    const run = deps(async () => null);
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, entities: ['properties'], tenantId });

    expect(report.properties.noResult).toHaveLength(1);
    const row = await readRow(id);
    expect(row.status).toBe('FAILED');
    expect(row.code).toBe('LEGACY_PERMANENT_NO_RESULT');
    expect(row.x).toBeCloseTo(before.x!, 6); // coordinates untouched
    expect(row.y).toBeCloseTo(before.y!, 6);

    // excluded from a subsequent run
    const second = deps(async () => ({ lat: 1, lng: 1 }));
    const r2 = await regeocodePermanent(second.deps, { ...BASE_OPTS, entities: ['properties'], tenantId });
    expect(r2.properties.scanned).toBe(0);
  });

  it('#4: a concurrent edit between selection and write is skipped (CAS on updated_at)', async () => {
    const tenantId = await seedTenant('T-cas');
    const id = await seedProperty(tenantId, { lat: -33.8, lng: 151.8, geocodingStatus: 'SUCCESS' });

    // The fake geocoder mutates the row (bumping updated_at) before returning,
    // so the CAS read at selection no longer matches at write time.
    const run = deps(async () => {
      await harness.prisma.property.update({ where: { id }, data: { notes: 'touched mid-run' } });
      return { lat: -34.0, lng: 150.0 };
    });
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, entities: ['properties'], tenantId });

    expect(report.properties.skippedConcurrent).toBe(1);
    expect(report.properties.updated).toBe(0);
    const row = await readRow(id);
    expect(row.marker).toBeNull(); // not stamped
    expect(row.y).toBeCloseTo(-33.8, 5); // original coordinate kept
  });

  it('#4c: a concurrent branch address edit is skipped and the address is never rewritten', async () => {
    const tenantId = await seedTenant('T-cas-branch');
    const branchId = (
      await harness.prisma.branch.create({
        data: {
          tenant_id: tenantId, name: 'City', status: 'ACTIVE',
          address_json: { street: '1 Old St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU', latitude: 0, longitude: 0 },
        },
      })
    ).id;

    const run = deps(async () => {
      await harness.prisma.branch.update({
        where: { id: branchId },
        data: { address_json: { street: '2 New St', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' } },
      });
      return { lat: -34.0, lng: 150.0 };
    });
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, entities: ['branches'], tenantId });

    expect(report.branches.skippedConcurrent).toBe(1);
    const branch = await harness.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const addr = branch.address_json as Record<string, unknown>;
    expect(addr['street']).toBe('2 New St'); // user's edit intact
    expect(addr['latitude']).toBeUndefined(); // script did not merge coords
    expect(branch.geocoded_permanently_at).toBeNull();
  });

  it('#5: strips committed import previews, leaving PREVIEW/PROCESSING and verified rows intact', async () => {
    const tenantId = await seedTenant('T-import');
    const legacyPreview = {
      rows: [
        { property: { geocode: { status: 'found', lat: 1, lng: 2 } } },
        { property: { geocode: { status: 'found', lat: 3, lng: 4, mode: 'permanent' } } },
      ],
    };
    const user = await harness.prisma.user.create({
      data: {
        tenant_id: tenantId, role: 'OP', name: 'Importer',
        email: `imp-${crypto.randomUUID().slice(0, 8)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
      },
    });
    const importData = (status: string) => ({
      tenant_id: tenantId, status, preview_json: legacyPreview,
      file_key: `imports/${crypto.randomUUID()}.csv`, original_filename: 'in.csv', created_by_user_id: user.id,
    });
    const committed = await harness.prisma.appointmentImport.create({ data: importData('COMPLETED') });
    const processing = await harness.prisma.appointmentImport.create({ data: importData('PROCESSING') });
    const preview = await harness.prisma.appointmentImport.create({ data: importData('PREVIEW') });

    const run = deps(async () => null);
    const report = await regeocodePermanent(run.deps, {
      ...BASE_OPTS, entities: [], stripImportPreviews: true, tenantId,
    });
    expect(report.importPreviews.stripped).toBe(1);

    const after = await harness.prisma.appointmentImport.findUniqueOrThrow({ where: { id: committed.id } });
    const rows = (after.preview_json as { rows: Array<{ property: { geocode: unknown } }> }).rows;
    expect(rows[0]!.property.geocode).toBeNull(); // found-no-mode stripped
    expect(rows[1]!.property.geocode).toMatchObject({ mode: 'permanent' }); // verified kept

    for (const untouched of [processing, preview]) {
      const row = await harness.prisma.appointmentImport.findUniqueOrThrow({ where: { id: untouched.id } });
      const r = (row.preview_json as { rows: Array<{ property: { geocode: unknown } }> }).rows;
      expect(r[0]!.property.geocode).toMatchObject({ status: 'found' });
    }
  });

  it('#6: bulk retry sets blocked rows to PENDING with the code cleared and enqueues the job', async () => {
    const tenantId = await seedTenant('T-retry');
    const blocked = await seedProperty(tenantId, {
      lat: -33.9, lng: 151.9, geocodingStatus: 'FAILED', geocodingFailureCode: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    });

    const run = deps(async () => null);
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, retryFailedPermanent: true, tenantId });

    expect(report.retriedFailedPermanent).toBe(1);
    const row = await readRow(blocked);
    expect(row.status).toBe('PENDING');
    expect(row.code).toBeNull();
    expect(run.enqueued).toEqual([{ name: 'property.geocode', data: { propertyId: blocked } }]);
  });

  it('#8/#9: false-MANUAL detection restores only the confirmed row, leaving the rest untouched', async () => {
    const tenantId = await seedTenant('T-fm');
    const geocoded: GeocodingResult = { lat: -33.600001, lng: 151.600001 };

    // (a) same address, pin equal to the geocode → restorable
    const a = await seedProperty(tenantId, { lat: -33.6, lng: 151.6, geocodingStatus: 'MANUAL', street: '5a Reef Rd', suburb: 'Bondi', state: 'NSW', postcode: '2026' });
    // (b) same address but ~55 m off → coordinates_differ
    const b = await seedProperty(tenantId, { lat: -33.6005, lng: 151.6, geocodingStatus: 'MANUAL', street: '5b Reef Rd', suburb: 'Bondi', state: 'NSW', postcode: '2026' });
    // (c) MANUAL with no audit → missingAudit
    const c = await seedProperty(tenantId, { lat: -33.61, lng: 151.61, geocodingStatus: 'MANUAL', street: '5c Reef Rd', suburb: 'Bondi', state: 'NSW', postcode: '2026' });
    // (d) audit whose street changed → address_changed_in_transition
    const d = await seedProperty(tenantId, { lat: -33.62, lng: 151.62, geocodingStatus: 'MANUAL', street: '5d Reef Rd', suburb: 'Bondi', state: 'NSW', postcode: '2026' });
    // (e) candidate (unchanged transition) but a LATER MANUAL→MANUAL edit changed the street,
    //     and its pin is far from the geocode → coordinates_differ + addressChangedAfterTransition: true
    const e = await seedProperty(tenantId, { lat: -33.63, lng: 151.63, geocodingStatus: 'MANUAL', street: '5e Reef Rd', suburb: 'Bondi', state: 'NSW', postcode: '2026' });

    const mkAudit = async (entityId: string, before: object, after: object, createdAt: Date) => {
      await harness.prisma.auditLog.create({
        data: {
          tenant_id: tenantId, actor_type: 'USER', entity_type: 'Property', entity_id: entityId,
          action: 'property.updated', before_json: before, after_json: after, created_at: createdAt,
        },
      });
    };
    const addr = (street: string, status: string) => ({ street, suburb: 'Bondi', state: 'NSW', country: 'AU', geocodingStatus: status });
    await mkAudit(a, addr('5a Reef Rd', 'SUCCESS'), addr('5a Reef Rd', 'MANUAL'), new Date('2026-08-01'));
    await mkAudit(b, addr('5b Reef Rd', 'SUCCESS'), addr('5b Reef Rd', 'MANUAL'), new Date('2026-08-01'));
    await mkAudit(d, addr('1 Old Rd', 'SUCCESS'), addr('5d Reef Rd', 'MANUAL'), new Date('2026-08-01'));
    // (e): the SUCCESS→MANUAL transition kept the address (so it is a candidate)…
    await mkAudit(e, addr('5e Reef Rd', 'SUCCESS'), addr('5e Reef Rd', 'MANUAL'), new Date('2026-08-01'));
    // …but a LATER MANUAL→MANUAL edit changed the street (after the transition cutoff).
    await mkAudit(e, addr('5e Reef Rd', 'MANUAL'), addr('7 Moved St', 'MANUAL'), new Date('2026-09-01'));

    const run = deps(async () => geocoded);
    const report = await regeocodePermanent(run.deps, { ...BASE_OPTS, entities: ['false-manual'], tenantId });

    expect(report.falseManual.restored).toBe(1);
    const rowA = await readRow(a);
    expect(rowA.status).toBe('SUCCESS');
    expect(rowA.marker).not.toBeNull();
    expect(rowA.x).toBeCloseTo(151.600001, 5);
    expect(rowA.y).toBeCloseTo(-33.600001, 5);

    const ambById = Object.fromEntries(report.falseManual.ambiguous.map((x) => [x.id, x]));
    expect(ambById[b]!.reason).toBe('coordinates_differ');
    expect(ambById[d]!.reason).toBe('address_changed_in_transition');
    expect(ambById[e]!.reason).toBe('coordinates_differ');
    // (e) has a later street-changing audit → flagged for priority manual review; (b) does not.
    expect(ambById[e]!.addressChangedAfterTransition).toBe(true);
    expect(ambById[b]!.addressChangedAfterTransition).toBe(false);
    expect(report.falseManual.missingAudit.map((m) => m.id)).toContain(c);
    // (b),(c),(d),(e) stay MANUAL untouched
    for (const id of [b, c, d, e]) expect((await readRow(id)).status).toBe('MANUAL');

    // #9: second run — (a) is no longer a candidate
    const second = deps(async () => geocoded);
    const r2 = await regeocodePermanent(second.deps, { ...BASE_OPTS, entities: ['false-manual'], tenantId });
    expect(r2.falseManual.restored).toBe(0);
  });
});
