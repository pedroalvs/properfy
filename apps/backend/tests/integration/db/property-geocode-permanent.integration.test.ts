/**
 * Real-database coverage for permanent-geocoding persistence (X02-1):
 *   - a permanent SUCCESS write stores lat/lng, the `geocoded_permanently_at`
 *     marker and keeps the PostGIS `coordinates` column consistent (ST_X/ST_Y);
 *   - an account-error FAILED write sets `geocoding_failure_code` and leaves no
 *     coordinate;
 *   - `findFailedGeocoding` excludes rows carrying a failure code (so the sweep
 *     never re-pays for them) and `countBlockedFailedGeocoding` counts them;
 *   - writing a different coordinate moves the PostGIS point; clearing it nulls
 *     the column.
 *
 * Only a real Postgres/PostGIS proves the `coordinates` column stays in lockstep
 * with lat/lng — unit tests mock the repository.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';

let harness: DbHarness;
let repo: PrismaPropertyRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaPropertyRepository(harness.prisma);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedTenant(name: string) {
  const tenant = await harness.prisma.tenant.create({
    data: { name, legal_name: `${name} LLC ${Math.random().toString(36).slice(2, 10)}`, status: 'ACTIVE' },
  });
  return tenant.id;
}

function buildProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> & { id: string; tenantId: string }) {
  const now = new Date();
  return new PropertyEntity({
    branchId: null,
    propertyCode: `P-${Math.random().toString(36).slice(2, 10)}`,
    type: 'HOUSE',
    street: `${Math.random().toString(36).slice(2, 8)} Ocean St`,
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
    ...overrides,
  });
}

async function readRow(id: string) {
  const rows = await harness.prisma.$queryRaw<
    Array<{ x: number | null; y: number | null; marker: Date | null; code: string | null; status: string }>
  >`
    SELECT ST_X(coordinates) AS x, ST_Y(coordinates) AS y,
           geocoded_permanently_at AS marker, geocoding_failure_code AS code, geocoding_status AS status
    FROM properties WHERE id = ${id}
  `;
  return rows[0]!;
}

describe('permanent geocoding persistence', () => {
  it('a permanent SUCCESS write stores lat/lng + marker and syncs the PostGIS point', async () => {
    const tenantId = await seedTenant('T-geo-success');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId }));

    const now = new Date();
    await repo.update(id, tenantId, {
      lat: -33.867753,
      lng: 151.207639,
      geocodingStatus: 'SUCCESS',
      geocodedPermanentlyAt: now,
      geocodingFailureCode: null,
    });

    const row = await readRow(id);
    expect(row.status).toBe('SUCCESS');
    expect(row.marker).not.toBeNull();
    expect(row.code).toBeNull();
    expect(row.x).toBeCloseTo(151.207639, 5); // ST_X is longitude
    expect(row.y).toBeCloseTo(-33.867753, 5); // ST_Y is latitude
  });

  it('an account-error FAILED write sets the failure code and stores no coordinate', async () => {
    const tenantId = await seedTenant('T-geo-account-error');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId }));

    await repo.update(id, tenantId, {
      geocodingStatus: 'FAILED',
      geocodingFailureCode: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    });

    const row = await readRow(id);
    expect(row.status).toBe('FAILED');
    expect(row.code).toBe('MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE');
    expect(row.x).toBeNull();
    expect(row.y).toBeNull();
    expect(row.marker).toBeNull();
  });

  it('findFailedGeocoding excludes coded failures; countBlockedFailedGeocoding counts them', async () => {
    const tenantId = await seedTenant('T-geo-sweep');
    const blockedId = crypto.randomUUID();
    const retryableId = crypto.randomUUID();
    await repo.save(buildProperty({ id: blockedId, tenantId }));
    await repo.save(buildProperty({ id: retryableId, tenantId }));

    await repo.update(blockedId, tenantId, {
      geocodingStatus: 'FAILED',
      geocodingFailureCode: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    });
    await repo.update(retryableId, tenantId, { geocodingStatus: 'FAILED' });

    const future = new Date(Date.now() + 60_000);
    const failed = await repo.findFailedGeocoding(future);
    const ids = failed.map((f) => f.id);
    expect(ids).toContain(retryableId);
    expect(ids).not.toContain(blockedId);

    const blockedCount = await repo.countBlockedFailedGeocoding();
    expect(blockedCount).toBeGreaterThanOrEqual(1);
  });

  it('writing a different coordinate moves the PostGIS point; clearing it nulls the column', async () => {
    const tenantId = await seedTenant('T-geo-move');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId }));

    await repo.update(id, tenantId, {
      lat: -33.8,
      lng: 151.2,
      geocodingStatus: 'MANUAL',
      geocodedPermanentlyAt: null,
    });
    let row = await readRow(id);
    expect(row.status).toBe('MANUAL');
    expect(row.marker).toBeNull();
    expect(row.x).toBeCloseTo(151.2, 5);
    expect(row.y).toBeCloseTo(-33.8, 5);

    await repo.update(id, tenantId, { lat: null, lng: null, geocodingStatus: 'PENDING' });
    row = await readRow(id);
    expect(row.x).toBeNull();
    expect(row.y).toBeNull();
  });
});
