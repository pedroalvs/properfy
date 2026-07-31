/**
 * CL_ADMIN / CL_USER tenant pinning on the appointments list — real database.
 *
 * `ListAppointmentsUseCase` resolves the tenant scope differently per role
 * (`list-appointments.use-case.ts`): AM and OP are cross-tenant and their
 * `filters.tenantId` narrows the query, while tenant-scoped roles are pinned
 * to their JWT `tenantId` and **any filter they pass is ignored** as
 * defence-in-depth.
 *
 * The sibling `op-tenant-scoping.integration.test.ts` proves the AM/OP half and
 * says in its own header that CL_* isolation is left to "unit tests + browser
 * QA". This file closes that half against real PostgreSQL.
 *
 * Why a real database and not mocks: a mocked repository returns whatever it
 * was told to regardless of the `tenant_id` argument, so it cannot distinguish
 * "the WHERE clause isolates rows" from "the WHERE clause was silently
 * dropped". That is precisely the failure this guards.
 *
 * Note the shape of the contract: unlike the branches list, a CL_* actor
 * reaching for another tenant is **not rejected** — the filter is discarded and
 * their own rows come back. Asserting `rejects.toThrow()` here would produce a
 * test that fails for the wrong reason today, and would pass for the wrong
 * reason if the behaviour ever changed to honour the filter.
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
import { ListAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function silentAuditService() {
  return { log: () => {} } as unknown as import('../../../src/shared/infrastructure/audit').AuditService;
}

describe('CL_* tenant pinning on the appointments list (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'CL-Pin Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'CL-Pin Tenant B' });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  /**
   * A tenant-scoped actor. The use case reads role and tenantId off the auth
   * context, not off the DB user row, so the seeded user id is only needed to
   * make the context well-formed.
   */
  function clActor(role: 'CL_ADMIN' | 'CL_USER', tenantId: string, userId: string): AuthContext {
    return { userId, tenantId, role, branchId: null, inspectorId: null };
  }

  function crossTenantActor(role: 'AM' | 'OP', userId: string): AuthContext {
    return { userId, tenantId: null, role, branchId: null, inspectorId: null };
  }

  function useCase() {
    return new ListAppointmentsUseCase(
      new PrismaAppointmentRepository(harness!.prisma),
      new AuthorizationService(silentAuditService()),
    );
  }

  async function listAs(actor: AuthContext, filters: Record<string, unknown> = {}) {
    const result = await useCase().execute({
      filters: filters as never,
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor,
    });
    return result.data.map((appointment) => appointment.id);
  }

  /**
   * Counter-proof, and it runs first on purpose: every assertion below is of
   * the form "B is absent". If tenant B's row were unreachable for some
   * unrelated reason — wrong status, a filter default, a broken fixture — those
   * would all pass while proving nothing. This shows B is genuinely there and
   * findable by an actor allowed to see it.
   */
  it('a cross-tenant actor can reach tenant B, so its absence below is meaningful', async () => {
    const ids = await listAs(crossTenantActor('OP', fixtureB!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).toContain(fixtureB!.appointmentId);
    expect(ids).not.toContain(fixtureA!.appointmentId);
  });

  it('scopes CL_ADMIN to its own tenant when no filter is passed', async () => {
    const ids = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId));

    expect(ids).toContain(fixtureA!.appointmentId);
    expect(ids).not.toContain(fixtureB!.appointmentId);
  });

  // The security case: the filter is neither honoured nor rejected — it is
  // discarded, and the actor still sees only their own tenant.
  it('ignores a CL_ADMIN request for another tenant instead of honouring it', async () => {
    const ids = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
  });

  it('scopes CL_USER to its own tenant when no filter is passed', async () => {
    const ids = await listAs(clActor('CL_USER', fixtureA!.tenantId, fixtureA!.userId));

    expect(ids).toContain(fixtureA!.appointmentId);
    expect(ids).not.toContain(fixtureB!.appointmentId);
  });

  it('ignores a CL_USER request for another tenant instead of honouring it', async () => {
    const ids = await listAs(clActor('CL_USER', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
  });

  // The pin must survive every other filter too: narrowing by something else
  // must not become a way to widen the tenant scope.
  it('keeps the pin when the request also carries an unrelated filter', async () => {
    const ids = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
      status: ['DONE'],
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
  });
});
