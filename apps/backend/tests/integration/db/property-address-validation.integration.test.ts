/**
 * Real-database coverage for V-1 on-save address validation (conditions 3 & 4):
 *  - (3) an ACCEPTED synchronous address edit writes lat/lng + SUCCESS + the
 *    `geocoded_permanently_at` marker, keeps the PostGIS `coordinates` column in
 *    lockstep (exactly like the manual-pin path), and enqueues NO geocode job;
 *  - (4) a freshly created MANUAL pin survives the retry sweep (it is returned by
 *    neither `findStalePendingGeocoding` nor `findFailedGeocoding`) and the
 *    geocode worker (which skips MANUAL) — its coordinates are never overwritten.
 *
 * Only a real Postgres/PostGIS proves the `coordinates` column stays consistent.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { UpdatePropertyUseCase } from '../../../src/modules/property/application/use-cases/update-property.use-case';
import { GeocodeWorker } from '../../../src/modules/property/infrastructure/workers/geocode.worker';

// The accepted-edit path must enqueue nothing; spy on the queue to prove it.
vi.mock('../../../src/shared/infrastructure/queue', () => ({ sendJob: vi.fn().mockResolvedValue('job-id') }));
import { sendJob } from '../../../src/shared/infrastructure/queue';

let harness: DbHarness;
let repo: PrismaPropertyRepository;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn() } as never;
const audit = { log: vi.fn() } as never;
const branchRepo = { findById: vi.fn() } as never;
const amActor: AuthContext = { userId: 'u-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

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
    Array<{ x: number | null; y: number | null; marker: Date | null; status: string }>
  >`
    SELECT ST_X(coordinates) AS x, ST_Y(coordinates) AS y,
           geocoded_permanently_at AS marker, geocoding_status AS status
    FROM properties WHERE id = ${id}
  `;
  return rows[0]!;
}

describe('V-1 address validation (real DB)', () => {
  it('(3) an accepted address edit writes SUCCESS + coords + marker, keeps PostGIS in lockstep, and enqueues no job', async () => {
    const tenantId = await seedTenant('V1 Accept');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId })); // PENDING, no coordinates

    const geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.861, lng: 151.21, placeType: 'address', relevance: 0.95, suburb: 'Kogarah' }) };
    const uc = new UpdatePropertyUseCase(repo, branchRepo, audit, logger, geocoder as never);

    await uc.execute({ propertyId: id, data: { street: '99 Verified Rd' }, actor: amActor });

    const row = await readRow(id);
    expect(row.status).toBe('SUCCESS');
    expect(row.marker).not.toBeNull(); // permanent geocode marker set
    // PostGIS coordinates column in lockstep with the written lat/lng (ST_X=lng, ST_Y=lat).
    expect(row.x).toBeCloseTo(151.21, 5);
    expect(row.y).toBeCloseTo(-33.861, 5);
    // Accepted synchronously → no orphaned property.geocode job.
    expect(sendJob).not.toHaveBeenCalled();
  });

  it('(3) the manual-pin path keeps the same PostGIS lockstep (coordinates == lat/lng), marker null', async () => {
    const tenantId = await seedTenant('V1 Manual');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId, lat: -33.4521, lng: 150.6612, geocodingStatus: 'MANUAL' }));

    const row = await readRow(id);
    expect(row.status).toBe('MANUAL');
    expect(row.marker).toBeNull(); // manual pin is not a permanent geocode
    expect(row.x).toBeCloseTo(150.6612, 5);
    expect(row.y).toBeCloseTo(-33.4521, 5);
  });

  it('(4) a MANUAL pin survives the retry sweep selectors and the geocode worker', async () => {
    const tenantId = await seedTenant('V1 Survive');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId, lat: -33.45, lng: 150.66, geocodingStatus: 'MANUAL' }));

    // Retry sweep: a future cutoff would catch any stale row — MANUAL must be in neither set.
    const future = new Date(Date.now() + 86_400_000);
    const stale = await repo.findStalePendingGeocoding(future);
    const failed = await repo.findFailedGeocoding(future);
    expect(stale.map((r) => r.id)).not.toContain(id);
    expect(failed.map((r) => r.id)).not.toContain(id);

    // Geocode worker skips MANUAL — never calls the provider, never overwrites.
    const geocoder = { geocode: vi.fn() };
    const worker = new GeocodeWorker(repo, geocoder as never, audit, logger);
    await worker.execute({ propertyId: id });
    expect(geocoder.geocode).not.toHaveBeenCalled();

    const row = await readRow(id);
    expect(row.status).toBe('MANUAL');
    expect(row.x).toBeCloseTo(150.66, 5);
    expect(row.y).toBeCloseTo(-33.45, 5);
  });
});
