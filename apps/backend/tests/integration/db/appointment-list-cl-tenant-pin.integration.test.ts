/**
 * CL_ADMIN / CL_USER tenant pinning on the appointments list — real database.
 *
 * `ListAppointmentsUseCase` resolves the tenant scope differently per role
 * (`list-appointments.use-case.ts`): AM and OP are cross-tenant and their
 * `filters.tenantId` narrows the query, while tenant-scoped roles are pinned
 * to their JWT `tenantId` and **any filter they pass is ignored** as
 * defence-in-depth.
 *
 * The sibling `op-tenant-scoping.integration.test.ts` proves the OP half — its
 * own header lists AM as not covered, on the grounds that AM and OP are
 * identical at the repository layer — and leaves CL_* isolation to "unit tests
 * + browser QA". This file closes the CL_* half against real PostgreSQL.
 *
 * Why a real database and not mocks: a mocked repository returns whatever it
 * was told to regardless of the `tenant_id` argument, so it cannot distinguish
 * "the WHERE clause isolates rows" from "the WHERE clause was silently
 * dropped". That is precisely the failure this guards.
 *
 * Note the shape of the contract: unlike the branches list — which throws a
 * ForbiddenError on a tenant mismatch — a CL_* actor reaching for another
 * tenant here is **not rejected**. The filter is discarded and their own rows
 * come back, so the assertions are on the returned ids. Copying the sibling's
 * `rejects.toThrow()` shape would give a test that fails today for the wrong
 * reason, and that would keep failing even if the pin were removed entirely:
 * honouring the filter resolves too, so a throw-based assertion can never
 * observe the regression this file exists to catch.
 *
 * The last case covers what used to be an open gap: a CL_* actor whose context
 * carried a null `tenantId` received an unscoped cross-tenant list, because
 * `buildWhere` applies `tenant_id` behind a truthiness check while the use case
 * passed `actor.tenantId ?? undefined`. `requireTenantScope` now fails closed
 * there. It is enforced in the use case rather than the repository because
 * `buildWhere` cannot tell a legitimately unscoped AM/OP listing from a pinned
 * actor whose tenant went missing — the role lives in the caller.
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
import {
  ListAppointmentsUseCase,
  type ListAppointmentsInput,
} from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
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

  /**
   * Typed rather than `as never`: an excess-property check is the only thing
   * standing between a typo'd key and a test that silently stops filtering —
   * exactly how `{ rentalTenantName }` slipped into the sibling file. The
   * `tests/` tree is not in any typecheck target today (`tsconfig.json`
   * includes `src/**` only), so this buys editor feedback now and real
   * enforcement the day tests are added to one.
   */
  async function listAs(
    actor: AuthContext,
    filters: ListAppointmentsInput['filters'] = {},
  ): Promise<{ ids: string[]; total: number }> {
    const result = await useCase().execute({
      filters,
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor,
    });
    // `total` comes from a second query (`count`) built off the same filters,
    // so asserting it is what covers the other half of the SQL the use case
    // emits — `findAll` alone would leave it unproven.
    return { ids: result.data.map((appointment) => appointment.id), total: result.total };
  }

  /**
   * Counter-proof. Every case below leans on "tenant B is absent", and absence
   * is the easiest thing to prove by accident: if B's row were unreachable for
   * an unrelated reason — a status default, a stray filter, a broken fixture —
   * they would all pass while proving nothing. This reaches B through the same
   * use case, repository and `buildWhere` the others go through, so it rules
   * that out rather than merely running first.
   */
  it('a cross-tenant actor can reach tenant B, so its absence below is meaningful', async () => {
    const { ids, total } = await listAs(crossTenantActor('OP', fixtureB!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).toContain(fixtureB!.appointmentId);
    expect(ids).not.toContain(fixtureA!.appointmentId);
    expect(total).toBe(1);
  });

  it('scopes CL_ADMIN to its own tenant when no filter is passed', async () => {
    const { ids, total } = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId));

    expect(ids).toContain(fixtureA!.appointmentId);
    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(total).toBe(1);
  });

  // The security case: the filter is neither honoured nor rejected — it is
  // discarded, and the actor still sees only their own tenant.
  it('ignores a CL_ADMIN request for another tenant instead of honouring it', async () => {
    const { ids, total } = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
    expect(total).toBe(1);
  });

  it('scopes CL_USER to its own tenant when no filter is passed', async () => {
    const { ids, total } = await listAs(clActor('CL_USER', fixtureA!.tenantId, fixtureA!.userId));

    expect(ids).toContain(fixtureA!.appointmentId);
    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(total).toBe(1);
  });

  it('ignores a CL_USER request for another tenant instead of honouring it', async () => {
    const { ids, total } = await listAs(clActor('CL_USER', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
    expect(total).toBe(1);
  });

  /**
   * Fail-closed. This is the case that used to be impossible to write: before
   * `requireTenantScope`, a pinned actor with no tenant produced no `tenant_id`
   * predicate at all, so this call returned BOTH tenants' rows. The failure
   * mode of a missing scope was maximum exposure, which is why a 403 is the
   * right answer even though no API path can currently produce this context.
   */
  it.each(['CL_ADMIN', 'CL_USER'] as const)(
    'refuses to list at all when %s carries no tenant, instead of listing everything',
    async (role) => {
      await expect(
        listAs({
          userId: fixtureA!.userId,
          tenantId: null,
          role,
          branchId: null,
          inspectorId: null,
        }),
      ).rejects.toMatchObject({ code: 'TENANT_SCOPE_REQUIRED' });
    },
  );

  // The pin must survive every other filter too: narrowing by something else
  // must not become a way to widen the tenant scope.
  it('keeps the pin when the request also carries an unrelated filter', async () => {
    const { ids, total } = await listAs(clActor('CL_ADMIN', fixtureA!.tenantId, fixtureA!.userId), {
      tenantId: fixtureB!.tenantId,
      status: ['DONE'],
    });

    expect(ids).not.toContain(fixtureB!.appointmentId);
    expect(ids).toContain(fixtureA!.appointmentId);
    expect(total).toBe(1);
  });
});
