/**
 * Property summary — countByType against a real PostgreSQL database.
 *
 * The summary endpoint's per-type counts rely on a groupBy that reuses the
 * repository's WHERE builder. A mocked repository would return counts
 * regardless of the tenant_id / branch_id / search / deleted_at clauses, so
 * this test proves the real SQL scoping:
 *
 *   1. Two independent tenants; extra properties of various types in tenant A.
 *   2. tenantId scoping: counts include only that tenant's rows.
 *   3. Soft-deleted rows are excluded.
 *   4. search narrows by street/suburb/property_code.
 *   5. branchId narrows to the branch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupDbHarness,
  teardownDbHarness,
  seedLegacyDoneAppointment,
  type DbHarness,
  type SeededAppointmentFixture,
} from './harness';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';

describe('Property summary: countByType (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;
  let branchAId: string | undefined;

  function repo() {
    if (!harness) throw new Error('harness not initialized');
    return new PrismaPropertyRepository(harness.prisma);
  }

  beforeAll(async () => {
    harness = await setupDbHarness();
    // Each fixture seeds one HOUSE property in its own tenant.
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Summary Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Summary Tenant B' });

    const houseA = await harness.prisma.property.findUniqueOrThrow({
      where: { id: fixtureA.propertyId },
      select: { branch_id: true },
    });
    branchAId = houseA.branch_id ?? undefined;

    const base = {
      tenant_id: fixtureA.tenantId,
      branch_id: null as string | null,
      suburb: 'Test',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS' as const,
    };
    await harness.prisma.property.createMany({
      data: [
        { ...base, property_code: 'SUM-APT-1', type: 'APARTMENT', street: '10 Apartment Ave' },
        { ...base, property_code: 'SUM-APT-2', type: 'APARTMENT', street: '12 Apartment Ave' },
        { ...base, property_code: 'SUM-COM-1', type: 'APARTMENT', street: '99 Commerce Rd' },
        {
          ...base,
          property_code: 'SUM-DEL-1',
          type: 'HOUSE',
          street: '66 Deleted St',
          deleted_at: new Date(),
        },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('scopes counts to the given tenant and excludes soft-deleted rows', async () => {
    if (!fixtureA) throw new Error('fixtures not initialized');

    const counts = await repo().countByType({ tenantId: fixtureA.tenantId });

    expect(counts).toEqual({ HOUSE: 1, APARTMENT: 3 });
  });

  it('aggregates across tenants when tenantId is omitted (AM/OP cross-tenant path)', async () => {
    const counts = await repo().countByType({});

    // Tenant A: 1 HOUSE + 3 APARTMENT; tenant B: 1 HOUSE.
    // The soft-deleted HOUSE stays excluded even without a tenant scope.
    expect(counts).toEqual({ HOUSE: 2, APARTMENT: 3 });
  });

  it('does not leak rows from another tenant', async () => {
    if (!fixtureB) throw new Error('fixtures not initialized');

    const counts = await repo().countByType({ tenantId: fixtureB.tenantId });

    expect(counts).toEqual({ HOUSE: 1 });
  });

  it('narrows by search on street', async () => {
    if (!fixtureA) throw new Error('fixtures not initialized');

    const counts = await repo().countByType({
      tenantId: fixtureA.tenantId,
      search: 'apartment ave',
    });

    expect(counts).toEqual({ APARTMENT: 2 });
  });

  it('narrows by branchId', async () => {
    if (!fixtureA || !branchAId) throw new Error('fixtures not initialized');

    const counts = await repo().countByType({
      tenantId: fixtureA.tenantId,
      branchId: branchAId,
    });

    expect(counts).toEqual({ HOUSE: 1 });
  });
});
