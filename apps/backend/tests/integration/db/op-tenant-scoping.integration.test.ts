/**
 * OP cross-tenant access — real database verification (DEC-003).
 *
 * `specs/DECISIONS.md` DEC-003 supersedes the earlier CORRECTION-001
 * close-it: OP is **cross-tenant** per `CLAUDE.md §6`, not tenant-scoped.
 * OP JWTs carry `tenant_id: null`; list endpoints honour a `?tenantId=`
 * query filter when the operator wants to narrow the view; get-by-id is
 * also cross-tenant because the full audit log + direct appointment
 * lookup is part of the operational job.
 *
 * This test proves the contract against a real PostgreSQL database
 * (not mocks), exercising `ListAppointmentsUseCase` and
 * `GetAppointmentUseCase` directly against the real Prisma repo.
 *
 * What's covered:
 *   1. Seed two independent tenants (T_A, T_B), each with a DONE appointment.
 *   2. `ListAppointmentsUseCase` with an OP actor (tenantId=null) and no
 *      filter → returns rows from BOTH tenants.
 *   3. Same OP actor with `filters.tenantId = T_A.id` → result narrowed
 *      to T_A only (the filter is honoured).
 *   4. Same OP actor with `filters.tenantId = T_B.id` → result narrowed
 *      to T_B only.
 *   5. `GetAppointmentUseCase` with an OP actor → can fetch both T_A and
 *      T_B appointments by id.
 *
 * What this test does NOT cover (covered elsewhere):
 *   - CL_ADMIN / CL_USER tenant isolation (unit tests + browser QA).
 *   - AM behaviour (identical to OP at the repo layer).
 *
 * This test was previously written to assert the old "OP is tenant-scoped"
 * behaviour. It was rewritten after DEC-003 to match the restored and
 * QA-validated cross-tenant contract. If a regression ever re-pins OP
 * back to tenant-scoped at the use-case level, this test will fail.
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
import { GetAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/get-appointment.use-case';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function silentAuditService() {
  return { log: () => {} } as unknown as import('../../../src/shared/infrastructure/audit').AuditService;
}

describe('DEC-003: OP cross-tenant access (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { rentalTenantName: 'OP-Scope Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { rentalTenantName: 'OP-Scope Tenant B' });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function opActor(userId: string): AuthContext {
    return {
      userId,
      // Null tenantId — OP JWTs issued by the login flow do not pin a
      // tenant (CLAUDE.md §6). See DEC-003 in specs/DECISIONS.md.
      tenantId: null,
      role: 'OP',
      branchId: null,
      inspectorId: null,
    };
  }

  it('ListAppointmentsUseCase: OP with no filter sees both tenants (cross-tenant)', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const { prisma } = harness;

    const appointmentRepo = new PrismaAppointmentRepository(prisma);
    const authService = new AuthorizationService(silentAuditService());
    const useCase = new ListAppointmentsUseCase(appointmentRepo, authService);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureA.userId),
    });

    const appointmentIds = result.data.map((a) => a.id);
    expect(appointmentIds).toContain(fixtureA.appointmentId);
    expect(appointmentIds).toContain(fixtureB.appointmentId);
  });

  it('ListAppointmentsUseCase: OP with filters.tenantId=A narrows to A only', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const { prisma } = harness;

    const appointmentRepo = new PrismaAppointmentRepository(prisma);
    const authService = new AuthorizationService(silentAuditService());
    const useCase = new ListAppointmentsUseCase(appointmentRepo, authService);

    const result = await useCase.execute({
      filters: { tenantId: fixtureA.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureA.userId),
    });

    const appointmentIds = result.data.map((a) => a.id);
    expect(appointmentIds).toContain(fixtureA.appointmentId);
    expect(appointmentIds).not.toContain(fixtureB.appointmentId);
  });

  it('ListAppointmentsUseCase: OP with filters.tenantId=B narrows to B only', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const { prisma } = harness;

    const appointmentRepo = new PrismaAppointmentRepository(prisma);
    const authService = new AuthorizationService(silentAuditService());
    const useCase = new ListAppointmentsUseCase(appointmentRepo, authService);

    const result = await useCase.execute({
      filters: { tenantId: fixtureB.tenantId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(fixtureB.userId),
    });

    const appointmentIds = result.data.map((a) => a.id);
    expect(appointmentIds).toContain(fixtureB.appointmentId);
    expect(appointmentIds).not.toContain(fixtureA.appointmentId);
  });

  it('GetAppointmentUseCase: OP can fetch appointments from any tenant by id', async () => {
    if (!harness || !fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    const { prisma } = harness;

    const appointmentRepo = new PrismaAppointmentRepository(prisma);
    const authService = new AuthorizationService(silentAuditService());
    const useCase = new GetAppointmentUseCase(appointmentRepo, authService);

    const fromA = await useCase.execute({
      appointmentId: fixtureA.appointmentId,
      actor: opActor(fixtureA.userId),
    });
    expect(fromA.id).toBe(fixtureA.appointmentId);
    expect(fromA.tenantId).toBe(fixtureA.tenantId);

    const fromB = await useCase.execute({
      appointmentId: fixtureB.appointmentId,
      actor: opActor(fixtureA.userId), // same OP actor, different tenant target
    });
    expect(fromB.id).toBe(fixtureB.appointmentId);
    expect(fromB.tenantId).toBe(fixtureB.tenantId);
  });
});
