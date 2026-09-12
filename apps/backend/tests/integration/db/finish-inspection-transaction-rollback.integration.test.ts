/**
 * WI-4 / #119 (CRITICAL) — finish-inspection atomicity, proven against a real
 * Postgres database.
 *
 * The unit test proves *composition* (both writes share the tx handle and the
 * idempotency success is deferred). This integration test proves the property
 * that actually protects the invariant: when the SCHEDULED -> DONE transition
 * throws inside the transaction, Postgres rolls back the `finished_at` write, so
 * the execution never ends up finished on a non-DONE appointment.
 *
 * Real Prisma + real PrismaInspectionExecutionRepository; only the status
 * transition is stubbed (to throw). No mocking of the database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { FinishInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { PrismaInspectionExecutionRepository } from '../../../src/modules/inspector-execution/infrastructure/prisma-inspection-execution.repository';
import type { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IIdempotencyService } from '../../../src/modules/inspector-execution/domain/idempotency.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

describe('FinishInspectionUseCase — transaction rollback (real DB, WI-4 / #119)', () => {
  let harness: DbHarness;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 120_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('rolls back finished_at when the DONE transition fails inside the transaction', async () => {
    const { prisma } = harness;

    // Seed a real appointment (for the FK) and a started, not-yet-finished execution.
    const fixture = await seedLegacyDoneAppointment(prisma, { tenantName: 'WI-4 Rollback Tenant' });
    const inspector = await prisma.inspector.create({
      data: {
        name: 'WI-4 Inspector',
        email: `wi4-${Math.random().toString(36).slice(2, 10)}@test.local`,
        status: 'ACTIVE',
      },
    });
    const execution = await prisma.inspectionExecution.create({
      data: {
        appointment_id: fixture.appointmentId,
        inspector_id: inspector.id,
        started_at: new Date('2026-01-10T09:00:00Z'),
        start_latitude: '-33.8688',
        start_longitude: '151.2093',
      },
    });

    const executionRepo = new PrismaInspectionExecutionRepository(prisma);

    // The transition throws AFTER the execution update runs inside the same tx.
    const executeStatusTransition = {
      executeInTransaction: vi.fn().mockRejectedValue(new Error('transition refused')),
    } as unknown as ExecuteStatusTransitionUseCase;

    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({ appointment: { tenantId: fixture.tenantId } }),
    } as unknown as IAppointmentRepository;

    const idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as IIdempotencyService;

    const auditService = { log: vi.fn() } as unknown as AuditService;

    const useCase = new FinishInspectionUseCase(
      executionRepo,
      idempotencyService,
      executeStatusTransition,
      appointmentRepo,
      auditService,
      new AuthorizationService(auditService),
      prisma,
    );

    const actor: AuthContext = {
      userId: 'user-insp-wi4',
      tenantId: null,
      role: 'INSP',
      branchId: null,
      inspectorId: inspector.id,
    };

    await expect(
      useCase.execute({
        appointmentId: fixture.appointmentId,
        latitude: -33.8688,
        longitude: 151.2093,
        idempotencyKey: 'wi4-rollback-key',
        actor,
      }),
    ).rejects.toThrow('transition refused');

    // The finished_at write must NOT have survived the failed transition.
    const row = await prisma.inspectionExecution.findUnique({ where: { id: execution.id } });
    expect(row?.finished_at).toBeNull();
    expect(row?.finish_latitude).toBeNull();

    // A success response must not be recorded when the transaction did not commit.
    expect(idempotencyService.set).not.toHaveBeenCalled();
  });
});
