/**
 * Real-database coverage for the "perfect address match" property-reuse
 * rule (appointment-import redesign):
 *   - `findByNormalizedAddress` is an indexed equality lookup that is
 *     case/whitespace-insensitive, tenant-scoped, and excludes soft-deleted
 *     rows.
 *   - The `properties_normalized_address_active_unique` partial unique index
 *     actually rejects a duplicate active address (same tenant) and allows
 *     reuse once the original is soft-deleted.
 *   - The BEFORE INSERT/UPDATE trigger computes the column correctly for rows
 *     inserted directly (bypassing the repository), and recomputes it on
 *     UPDATE.
 *
 * Only a real Postgres proves the trigger + partial unique index behave as
 * designed — unit tests mock the repository and cannot exercise either.
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
    type: 'RESIDENTIAL',
    street: '3/18 Ocean St',
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

describe('PrismaPropertyRepository.findByNormalizedAddress', () => {
  it('finds an exact match, case/whitespace-insensitive', async () => {
    const tenantId = await seedTenant('T-address-match');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '3/18 Ocean St' }));

    const found = await repo.findByNormalizedAddress(tenantId, {
      street: '  3/18   OCEAN st ', addressLine2: null, suburb: ' kogarah ', state: 'nsw', postcode: '2217',
    });
    expect(found).not.toBeNull();
    expect(found!.tenantId).toBe(tenantId);
  });

  it('returns null when the address does not match', async () => {
    const tenantId = await seedTenant('T-address-nomatch');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '1 Other St' }));

    const found = await repo.findByNormalizedAddress(tenantId, {
      street: '3/18 Ocean St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    expect(found).toBeNull();
  });

  it('does not match the same address owned by a different tenant', async () => {
    const tenantA = await seedTenant('T-address-A');
    const tenantB = await seedTenant('T-address-B');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId: tenantA, street: '9 Shared St', suburb: 'Rockdale', postcode: '2216' }));

    const found = await repo.findByNormalizedAddress(tenantB, {
      street: '9 Shared St', addressLine2: null, suburb: 'Rockdale', state: 'NSW', postcode: '2216',
    });
    expect(found).toBeNull();
  });

  it('does not match a soft-deleted property', async () => {
    const tenantId = await seedTenant('T-address-deleted');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId, street: '5 Deleted St', suburb: 'Carlton', postcode: '2218' }));
    await repo.update(id, tenantId, { deletedAt: new Date() });

    const found = await repo.findByNormalizedAddress(tenantId, {
      street: '5 Deleted St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218',
    });
    expect(found).toBeNull();
  });

  it('treats null and blank addressLine2 as equivalent', async () => {
    const tenantId = await seedTenant('T-address-line2');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '7 Unit St', addressLine2: null, suburb: 'Bexley', postcode: '2207' }));

    const found = await repo.findByNormalizedAddress(tenantId, {
      street: '7 Unit St', addressLine2: '   ', suburb: 'Bexley', state: 'NSW', postcode: '2207',
    });
    expect(found).not.toBeNull();
  });
});

describe('PrismaPropertyRepository.findManyByNormalizedAddressKeys', () => {
  it('finds all matching properties for a batch of keys in one query, tenant-scoped', async () => {
    const tenantA = await seedTenant('T-batch-A');
    const tenantB = await seedTenant('T-batch-B');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId: tenantA, street: '11 Batch St', suburb: 'Kogarah', postcode: '2217' }));
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId: tenantA, street: '12 Batch St', suburb: 'Kogarah', postcode: '2217' }));
    // Same address as the first, but a different tenant — must not leak in.
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId: tenantB, street: '11 Batch St', suburb: 'Kogarah', postcode: '2217' }));

    const { buildNormalizedAddressKey } = await import('../../../src/shared/domain/normalize-address');
    const keys = [
      buildNormalizedAddressKey({ street: '11 Batch St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217' }),
      buildNormalizedAddressKey({ street: '12 Batch St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217' }),
      buildNormalizedAddressKey({ street: '99 Nonexistent St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217' }),
    ];

    const found = await repo.findManyByNormalizedAddressKeys(tenantA, keys);
    expect(found).toHaveLength(2);
    expect(found.every((p) => p.tenantId === tenantA)).toBe(true);
  });

  it('returns an empty array for an empty key list without querying', async () => {
    const tenantId = await seedTenant('T-batch-empty');
    const found = await repo.findManyByNormalizedAddressKeys(tenantId, []);
    expect(found).toEqual([]);
  });
});

describe('PrismaPropertyRepository.update — tenant scoping', () => {
  it('does not write coordinates when the tenant-scoped update matches no row (cross-tenant id)', async () => {
    const tenantA = await seedTenant('T-coord-scope-A');
    const tenantB = await seedTenant('T-coord-scope-B');
    const propertyBId = crypto.randomUUID();
    await repo.save(buildProperty({ id: propertyBId, tenantId: tenantB, street: '20 Guard St', suburb: 'Oatley', postcode: '2223' }));

    // Calling update with tenant A's scope but tenant B's property id must be
    // a no-op — including for syncCoordinates, which writes the PostGIS
    // `coordinates` column by id alone and has no tenant_id in its own WHERE.
    await repo.update(propertyBId, tenantA, { lat: -33.9, lng: 151.1 });

    const [row] = await harness.prisma.$queryRaw<Array<{ has_coords: boolean }>>`
      SELECT (coordinates IS NOT NULL) AS has_coords FROM properties WHERE id = ${propertyBId}
    `;
    expect(row!.has_coords).toBe(false);
  });

  it('does write coordinates when the tenant-scoped update matches the row', async () => {
    const tenantId = await seedTenant('T-coord-scope-match');
    const propertyId = crypto.randomUUID();
    await repo.save(buildProperty({ id: propertyId, tenantId, street: '21 Guard St', suburb: 'Oatley', postcode: '2223' }));

    await repo.update(propertyId, tenantId, { lat: -33.9, lng: 151.1 });

    const [row] = await harness.prisma.$queryRaw<Array<{ has_coords: boolean }>>`
      SELECT (coordinates IS NOT NULL) AS has_coords FROM properties WHERE id = ${propertyId}
    `;
    expect(row!.has_coords).toBe(true);
  });
});

describe('properties_normalized_address_active_unique (partial unique index)', () => {
  it('rejects a second active property with the same tenant+address as a clean PropertyAddressConflictError, not a raw P2002', async () => {
    const { PropertyAddressConflictError } = await import('../../../src/modules/property/domain/property.errors');
    const tenantId = await seedTenant('T-dup-guard');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '2 Dup St', suburb: 'Peakhurst', postcode: '2210' }));

    await expect(
      repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '2 Dup St', suburb: 'Peakhurst', postcode: '2210' })),
    ).rejects.toBeInstanceOf(PropertyAddressConflictError);
  });

  it('rejects a concurrent update that would collide with another property, as a clean PropertyAddressConflictError', async () => {
    const { PropertyAddressConflictError } = await import('../../../src/modules/property/domain/property.errors');
    const tenantId = await seedTenant('T-dup-update-race');
    await repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '10 Taken St', suburb: 'Mortdale', postcode: '2223' }));
    const otherId = crypto.randomUUID();
    await repo.save(buildProperty({ id: otherId, tenantId, street: '11 Free St', suburb: 'Mortdale', postcode: '2223' }));

    // Simulates the race the use-case pre-check can't fully close: the row
    // is updated to an address that collides with the first property.
    await expect(
      repo.update(otherId, tenantId, { street: '10 Taken St' }),
    ).rejects.toBeInstanceOf(PropertyAddressConflictError);
  });

  it('allows reusing an address once the original is soft-deleted', async () => {
    const tenantId = await seedTenant('T-dup-reuse');
    const firstId = crypto.randomUUID();
    await repo.save(buildProperty({ id: firstId, tenantId, street: '4 Reuse St', suburb: 'Allawah', postcode: '2218' }));
    await repo.update(firstId, tenantId, { deletedAt: new Date() });

    await expect(
      repo.save(buildProperty({ id: crypto.randomUUID(), tenantId, street: '4 Reuse St', suburb: 'Allawah', postcode: '2218' })),
    ).resolves.not.toThrow();
  });
});

describe('normalized_address_key trigger', () => {
  it('computes the key on direct INSERT even when the column is omitted (test fixtures, seed scripts)', async () => {
    const tenantId = await seedTenant('T-trigger-insert');
    const row = await harness.prisma.property.create({
      data: {
        tenant_id: tenantId,
        property_code: `TRIG-${Math.random().toString(36).slice(2, 10)}`,
        type: 'RESIDENTIAL',
        street: '  8   Trigger  St ',
        suburb: 'Monterey',
        postcode: '2217',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'PENDING',
      },
    });
    expect(row.normalized_address_key).toBe('8 trigger st||monterey|nsw|2217');
  });

  it('recomputes the key on UPDATE when address fields change', async () => {
    const tenantId = await seedTenant('T-trigger-update');
    const id = crypto.randomUUID();
    await repo.save(buildProperty({ id, tenantId, street: '10 Original St', suburb: 'Ramsgate', postcode: '2217' }));

    await repo.update(id, tenantId, { street: '11 Changed St' });

    const row = await harness.prisma.property.findUniqueOrThrow({ where: { id } });
    expect(row.normalized_address_key).toBe('11 changed st||ramsgate|nsw|2217');
  });
});
