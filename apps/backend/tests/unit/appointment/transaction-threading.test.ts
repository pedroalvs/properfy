/**
 * Every place that opens a `$transaction` must actually run its writes inside it.
 *
 * All three of these used to call `appointmentRepo.update` without the
 * transaction client, so the status write escaped to the global connection while
 * only the confirmation-cycle work was transactional — meaning a cycle failure
 * rolled back the cycle and left the status change committed. The bug was
 * invisible because the code *looks* transactional.
 *
 * These are unit-level proofs that the handle is threaded. The proof that a
 * rollback actually undoes the write needs real Postgres — see
 * tests/integration/db/transition-transaction-rollback.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { ReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { RejectUnconfirmedAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/reject-unconfirmed-appointments.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

/** Stand-in for a Prisma.TransactionClient — identity is all these tests need. */
const TX = { __sentinel: 'tx' } as never;

function fakePrisma() {
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)),
  } as never;
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    tenantId: 'tenant-1',
    status: 'SCHEDULED',
    serviceTypeId: 'st-1',
    serviceGroupId: null,
    inspectorId: 'insp-1',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    scheduledDate: new Date('2031-01-05'),
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    ...overrides,
  };
}

const auditService = { log: vi.fn() };

describe('ExecuteStatusTransitionUseCase — DRAFT reopen transaction', () => {
  it('runs the appointment write inside the transaction it opened', async () => {
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({ appointment: makeAppointment({ status: 'CANCELLED' }) }),
      update: vi.fn(),
    };
    const cycleService = { invalidateOnReopen: vi.fn() };
    const prisma = fakePrisma();

    const uc = new ExecuteStatusTransitionUseCase(
      appointmentRepo as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as never,
      { get: vi.fn(), getWithHash: vi.fn(), set: vi.fn() } as never,
      auditService as never,
      new AuthorizationService(auditService as never),
      undefined,
      undefined,
      undefined,
      undefined,
      cycleService as never,
      prisma,
      undefined,
    );

    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'reopening',
      actor: { userId: 'u1', role: 'AM', tenantId: null, branchId: null, inspectorId: null } as never,
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ status: 'DRAFT' }),
      TX,
    );
    expect(cycleService.invalidateOnReopen).toHaveBeenCalledWith('appt-1', 'tenant-1', TX);
  });
});

describe('ReopenForRescheduleUseCase', () => {
  it('runs the appointment write inside the transaction it opened', async () => {
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({ appointment: makeAppointment() }),
      update: vi.fn(),
    };
    const cycleService = { invalidateOnReopen: vi.fn() };
    const prisma = fakePrisma();

    const uc = new ReopenForRescheduleUseCase(
      appointmentRepo as never,
      auditService as never,
      new AuthorizationService(auditService as never),
      undefined,
      cycleService as never,
      prisma,
    );

    await uc.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2031-02-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '12:00',
      actor: { userId: 'u1', role: 'AM', tenantId: null, branchId: null, inspectorId: null } as never,
    } as never);

    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ status: 'DRAFT' }),
      TX,
    );
  });
});

describe('RejectUnconfirmedAppointmentsUseCase', () => {
  it('runs the appointment write inside the transaction it opened', async () => {
    const appointmentRepo = {
      findUnconfirmedForDate: vi.fn().mockResolvedValue([
        makeAppointment({ status: 'SCHEDULED', rentalTenantConfirmationStatus: 'PENDING' }),
      ]),
      update: vi.fn(),
    };
    const cycleService = { invalidateOnReject: vi.fn() };
    const prisma = fakePrisma();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const uc = new RejectUnconfirmedAppointmentsUseCase(
      appointmentRepo as never,
      { findById: vi.fn().mockResolvedValue(null) } as never,
      auditService as never,
      logger as never,
      cycleService as never,
      prisma,
    );

    await uc.execute();

    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ status: 'REJECTED' }),
      TX,
    );
    expect(cycleService.invalidateOnReject).toHaveBeenCalledWith('appt-1', 'tenant-1', TX);
  });
});
