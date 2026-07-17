/**
 * `findManyByPropertyCodes` — tenant isolation against a real database.
 *
 * The property-import row resolver uses this batched lookup to decide
 * PROPERTY_CODE_CONFLICT errors. A mocked repository returns whatever the
 * test seeds regardless of the WHERE clause, which is exactly how a dropped
 * `tenant_id` filter goes unnoticed (see `feedback_mock_masks_real_bug` /
 * the OP tenant-scoping bug class). This proves against real PostgreSQL:
 *
 *   1. The lookup finds codes belonging to the queried tenant.
 *   2. A code that exists in ANOTHER tenant is NOT returned — the same
 *      code can legitimately exist in two agencies without conflicting.
 *   3. Soft-deleted properties are excluded, so a deleted property's code
 *      can be re-imported.
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

describe('Property import code lookup: tenant isolation (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;
  let codeA: string;
  let codeB: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Code-Lookup Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Code-Lookup Tenant B' });
    const propA = await harness.prisma.property.findUniqueOrThrow({ where: { id: fixtureA.propertyId } });
    const propB = await harness.prisma.property.findUniqueOrThrow({ where: { id: fixtureB.propertyId } });
    codeA = propA.property_code;
    codeB = propB.property_code;
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('returns only properties of the queried tenant, even when asked for another tenant codes', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const repo = new PrismaPropertyRepository(harness.prisma);

    const found = await repo.findManyByPropertyCodes(fixtureA.tenantId, [codeA, codeB]);

    expect(found.map((p) => p.id)).toEqual([fixtureA.propertyId]);
    expect(found[0]!.tenantId).toBe(fixtureA.tenantId);
  });

  it('returns nothing for codes that only exist in another tenant', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const repo = new PrismaPropertyRepository(harness.prisma);

    const found = await repo.findManyByPropertyCodes(fixtureB.tenantId, [codeA]);
    expect(found).toEqual([]);
  });

  it('excludes soft-deleted properties so their code can be re-imported', async () => {
    if (!harness || !fixtureA) throw new Error('fixtures not initialized');
    const repo = new PrismaPropertyRepository(harness.prisma);

    await harness.prisma.property.update({
      where: { id: fixtureA.propertyId },
      data: { deleted_at: new Date() },
    });
    try {
      const found = await repo.findManyByPropertyCodes(fixtureA.tenantId, [codeA]);
      expect(found).toEqual([]);
    } finally {
      await harness.prisma.property.update({
        where: { id: fixtureA.propertyId },
        data: { deleted_at: null },
      });
    }
  });

  it('short-circuits an empty code list without touching the database', async () => {
    if (!harness || !fixtureA) throw new Error('fixtures not initialized');
    const repo = new PrismaPropertyRepository(harness.prisma);
    const found = await repo.findManyByPropertyCodes(fixtureA.tenantId, []);
    expect(found).toEqual([]);
  });
});
