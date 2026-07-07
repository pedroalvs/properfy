/**
 * nextPropertyNumber against a real PostgreSQL database.
 *
 * The generated property code depends on MAX(property_number) + 1 scoped by
 * tenant and INCLUDING soft-deleted rows (a reused number would collide with a
 * historical code). A mocked repository cannot prove either clause, so this
 * test seeds two tenants plus a soft-deleted row and locks the behavior.
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

describe('Property: nextPropertyNumber (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;

  function repo() {
    if (!harness) throw new Error('harness not initialized');
    return new PrismaPropertyRepository(harness.prisma);
  }

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'NextNum Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'NextNum Tenant B' });

    const base = {
      suburb: 'Test',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS' as const,
      type: 'HOUSE' as const,
    };
    await harness.prisma.property.createMany({
      data: [
        { ...base, tenant_id: fixtureA!.tenantId, property_code: 'NN-A-1', property_number: 1, street: '1 A St' },
        { ...base, tenant_id: fixtureA!.tenantId, property_code: 'NN-A-2', property_number: 2, street: '2 A St' },
        // Soft-deleted row holds the highest number in tenant A — it must
        // still be counted so its number is never reissued.
        {
          ...base,
          tenant_id: fixtureA!.tenantId,
          property_code: 'NN-A-7',
          property_number: 7,
          street: '7 A St',
          deleted_at: new Date(),
        },
        { ...base, tenant_id: fixtureB!.tenantId, property_code: 'NN-B-3', property_number: 3, street: '3 B St' },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('returns MAX + 1 within the tenant, including soft-deleted rows', async () => {
    const next = await repo().nextPropertyNumber(fixtureA!.tenantId);
    expect(next).toBe(8);
  });

  it('scopes the sequence per tenant', async () => {
    const next = await repo().nextPropertyNumber(fixtureB!.tenantId);
    expect(next).toBe(4);
  });

  it('starts at 1 for a tenant with no numbered properties', async () => {
    const fixtureC = await seedLegacyDoneAppointment(harness!.prisma, { tenantName: 'NextNum Tenant C' });
    // The fixture's own property has no property_number (legacy row).
    const next = await repo().nextPropertyNumber(fixtureC.tenantId);
    expect(next).toBe(1);
  });
});
