/**
 * Branches list — tenant scoping, real database verification.
 *
 * `/v1/branches` is the option source for every Branch select in the web app,
 * and the whole frontend contract depends on one property of this query: it
 * returns the requested tenant's branches and nothing else. A mocked
 * repository returns rows regardless of the filter arguments, so it cannot
 * prove the `tenant_id` WHERE clause is actually applied — that needs a real
 * PostgreSQL database with more than one tenant in it.
 *
 * The route-level matrix (which actor may pass `?tenantId=`) is covered by
 * `tests/integration/tenant/list-branches.route.test.ts`. This test covers the
 * layer below: given a tenant id, the repository query must not leak another
 * tenant's branches, for a global (AM/OP) actor as well as a tenant-pinned one.
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
import { ListBranchesUseCase } from '../../../src/modules/tenant/application/use-cases/list-branches.use-case';
import { PrismaBranchRepository } from '../../../src/modules/tenant/infrastructure/prisma-branch.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';

describe('Branches list: tenant scoping (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Branch-Scope Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Branch-Scope Tenant B' });
    // A second branch on tenant B, so "only A's rows" is a real filter result
    // and not just an artifact of each tenant owning exactly one branch.
    await harness.prisma.branch.create({
      data: { tenant_id: fixtureB.tenantId, name: 'Branch-Scope B Second', status: 'ACTIVE' },
    });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function actor(role: 'AM' | 'OP' | 'CL_ADMIN', tenantId: string | null): AuthContext {
    return { userId: 'usr-branch-scope', tenantId, role, branchId: null, inspectorId: null };
  }

  function useCase(h: DbHarness) {
    return new ListBranchesUseCase(
      new PrismaTenantRepository(h.prisma),
      new PrismaBranchRepository(h.prisma),
    );
  }

  it('returns only the requested tenant branches for a global actor', async () => {
    const result = await useCase(harness!).execute({
      tenantId: fixtureA!.tenantId,
      filters: {},
      pagination: { page: 1, pageSize: 100 },
      actor: actor('AM', null),
    });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((b) => b.tenantId === fixtureA!.tenantId)).toBe(true);
    expect(result.data.some((b) => b.id === fixtureA!.branchId)).toBe(true);
    expect(result.data.some((b) => b.tenantId === fixtureB!.tenantId)).toBe(false);
    expect(result.total).toBe(result.data.length);
  });

  it('returns the other tenant branches when asked for that tenant', async () => {
    const result = await useCase(harness!).execute({
      tenantId: fixtureB!.tenantId,
      filters: {},
      pagination: { page: 1, pageSize: 100 },
      actor: actor('OP', null),
    });

    expect(result.data.every((b) => b.tenantId === fixtureB!.tenantId)).toBe(true);
    // The seeded branch plus the extra one created above.
    expect(result.data.length).toBe(2);
  });

  it('rejects a tenant-pinned actor reaching another tenant branches', async () => {
    await expect(
      useCase(harness!).execute({
        tenantId: fixtureB!.tenantId,
        filters: {},
        pagination: { page: 1, pageSize: 100 },
        actor: actor('CL_ADMIN', fixtureA!.tenantId),
      }),
    ).rejects.toThrow(/permission/i);
  });
});
