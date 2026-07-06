/**
 * Properties list — OP cross-tenant access, real database verification.
 *
 * `list-properties.use-case.ts` previously treated OP like a tenant-scoped
 * role, coercing its (null) JWT `tenantId` via `!` and silently dropping the
 * `?tenantId=` query filter — the exact bug class documented as "Bug C-B2"
 * for the appointment list (see `op-tenant-scoping.integration.test.ts`).
 * This meant an OP picking an agency in the Properties page's Agency filter
 * would still see every agency's properties, because the filter was ignored.
 *
 * This test proves the fixed contract against a real PostgreSQL database
 * (not mocks — a mocked repository returns rows regardless of the filter
 * args and would hide a dropped `tenant_id` WHERE clause):
 *
 *   1. Seed two independent tenants (T_A, T_B), each with one property.
 *   2. `ListPropertiesUseCase` with an OP actor (tenantId=null) and no
 *      filter → returns properties from BOTH tenants (cross-tenant default).
 *   3. Same OP actor with `filters.tenantId = T_A.id` → narrowed to T_A only.
 *   4. Same OP actor with `filters.tenantId = T_B.id` → narrowed to T_B only.
 *   5. A CL_USER actor is pinned to its own tenant regardless of any
 *      `filters.tenantId` it (should never, but might) send.
 *   6. `tenantName` (the new Agency-column field) round-trips from the real
 *      `tenants` table join.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import {
  setupDbHarness,
  teardownDbHarness,
  seedLegacyDoneAppointment,
  type DbHarness,
  type SeededAppointmentFixture,
} from './harness';
import { ListPropertiesUseCase } from '../../../src/modules/property/application/use-cases/list-properties.use-case';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';

describe('Properties list: OP cross-tenant access (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Property-Scope Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Property-Scope Tenant B' });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function opActor(userId: string): AuthContext {
    return {
      userId,
      tenantId: null,
      role: 'OP',
      branchId: null,
      inspectorId: null,
    };
  }

  function clUserActor(userId: string, tenantId: string): AuthContext {
    return {
      userId,
      tenantId,
      role: 'CL_USER',
      branchId: null,
      inspectorId: null,
    };
  }

  it('OP with no filter sees properties from both tenants (cross-tenant)', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const propertyRepo = new PrismaPropertyRepository(harness.prisma);
    const useCase = new ListPropertiesUseCase(propertyRepo);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureA.userId),
    });

    const propertyIds = result.data.map((p) => p.id);
    expect(propertyIds).toContain(fixtureA.propertyId);
    expect(propertyIds).toContain(fixtureB.propertyId);
  });

  it('OP with filters.tenantId=A narrows to A only (the fixed bug)', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const propertyRepo = new PrismaPropertyRepository(harness.prisma);
    const useCase = new ListPropertiesUseCase(propertyRepo);

    const result = await useCase.execute({
      filters: { tenantId: fixtureA.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureA.userId),
    });

    const propertyIds = result.data.map((p) => p.id);
    expect(propertyIds).toContain(fixtureA.propertyId);
    expect(propertyIds).not.toContain(fixtureB.propertyId);
  });

  it('OP with filters.tenantId=B narrows to B only', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const propertyRepo = new PrismaPropertyRepository(harness.prisma);
    const useCase = new ListPropertiesUseCase(propertyRepo);

    const result = await useCase.execute({
      filters: { tenantId: fixtureB.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureB.userId),
    });

    const propertyIds = result.data.map((p) => p.id);
    expect(propertyIds).toContain(fixtureB.propertyId);
    expect(propertyIds).not.toContain(fixtureA.propertyId);
  });

  it('CL_USER is pinned to its own tenant regardless of filters.tenantId', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const propertyRepo = new PrismaPropertyRepository(harness.prisma);
    const useCase = new ListPropertiesUseCase(propertyRepo);

    const result = await useCase.execute({
      filters: { tenantId: fixtureB.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: clUserActor(fixtureA.userId, fixtureA.tenantId),
    });

    const propertyIds = result.data.map((p) => p.id);
    expect(propertyIds).toContain(fixtureA.propertyId);
    expect(propertyIds).not.toContain(fixtureB.propertyId);
  });

  it('carries tenantName through from the real tenants table for the Agency column', async () => {
    if (!harness || !fixtureA) throw new Error('fixtures not initialized');
    const propertyRepo = new PrismaPropertyRepository(harness.prisma);
    const useCase = new ListPropertiesUseCase(propertyRepo);

    const result = await useCase.execute({
      filters: { tenantId: fixtureA.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureA.userId),
    });

    const property = result.data.find((p) => p.id === fixtureA.propertyId);
    expect(property?.tenantName).toBe('Property-Scope Tenant A');
  });
});
