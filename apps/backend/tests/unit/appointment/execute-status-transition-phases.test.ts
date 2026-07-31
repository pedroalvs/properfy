/**
 * The two-phase split: DB writes belong in the caller's transaction, everything
 * else must wait until it commits.
 *
 * Why the side effects cannot be transactional — each is independently fatal:
 * the notification handler mints AND revokes portal tokens and enqueues to
 * pg-boss over a different connection (a rollback would kill a live tenant link
 * for a transition that never happened, and a queued email cannot be recalled);
 * the STATUS_TRANSITION subscriber writes to `service_groups` on the global
 * client, which is the row `reservePortalWindow` holds FOR UPDATE, so awaiting
 * it inside that transaction self-deadlocks until Prisma's 5s timeout.
 *
 * `idempotencyService.set` goes the other way — INTO the transaction — because a
 * key that survives a rollback makes the retry return a cached success for work
 * that never happened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const TX = { __sentinel: 'tx' } as never;

const appointmentRepo = { findById: vi.fn(), update: vi.fn() };
const userRepo = { findById: vi.fn() };
const inspectorRepo = { findById: vi.fn() };
const idempotencyService = { get: vi.fn(), getWithHash: vi.fn(), set: vi.fn() };
const auditService = { log: vi.fn() };
const onTransitionHandler = { execute: vi.fn() };
const domainEventBus = { emit: vi.fn().mockResolvedValue(undefined), on: vi.fn(), clear: vi.fn() };

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    tenantId: 'tenant-1',
    status: 'AWAITING_INSPECTOR',
    serviceTypeId: 'st-1',
    serviceGroupId: 'sg-1',
    inspectorId: 'insp-1',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    reason: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    ...overrides,
  };
}

function makeUseCase() {
  return new ExecuteStatusTransitionUseCase(
    appointmentRepo as never,
    userRepo as never,
    inspectorRepo as never,
    idempotencyService as never,
    auditService as never,
    new AuthorizationService(auditService as never),
    undefined,
    onTransitionHandler as never,
    undefined,
    domainEventBus as never,
    undefined,
    undefined,
    undefined,
  );
}

const OP_ACTOR = { userId: 'u1', role: 'OP', tenantId: 'tenant-1', branchId: null, inspectorId: null } as never;

beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.findById.mockResolvedValue({ appointment: makeAppointment() });
  appointmentRepo.update.mockResolvedValue(undefined);
  onTransitionHandler.execute.mockResolvedValue(undefined);
  domainEventBus.emit.mockResolvedValue(undefined);
  idempotencyService.get.mockResolvedValue(null);
});

describe('executeInTransaction — phase 1 writes, phase 2 waits', () => {
  it('writes the appointment but holds every side effect until runAfterCommit', async () => {
    const uc = makeUseCase();

    const result = await uc.executeInTransaction(
      { appointmentId: 'appt-1', targetStatus: 'SCHEDULED', actor: OP_ACTOR },
      TX,
    );

    // Phase 1 happened.
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1', 'tenant-1', expect.objectContaining({ status: 'SCHEDULED' }), TX,
    );
    expect(result.output.status).toBe('SCHEDULED');

    // Phase 2 has not.
    expect(auditService.log).not.toHaveBeenCalled();
    expect(onTransitionHandler.execute).not.toHaveBeenCalled();
    expect(domainEventBus.emit).not.toHaveBeenCalled();

    await result.runAfterCommit();

    expect(auditService.log).toHaveBeenCalled();
    expect(onTransitionHandler.execute).toHaveBeenCalled();
    expect(domainEventBus.emit).toHaveBeenCalled();
  });

  it('threads the transaction into every phase-1 read', async () => {
    const uc = makeUseCase();

    await uc.executeInTransaction(
      { appointmentId: 'appt-1', targetStatus: 'SCHEDULED', idempotencyKey: 'k1', actor: OP_ACTOR },
      TX,
    );

    // The portal join depends on this: the guards below read serviceGroupId,
    // inspectorId and rentalTenantConfirmationStatus written by an uncommitted
    // reservation. On the global client they would all read stale.
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1', TX);
    expect(idempotencyService.get).toHaveBeenCalledWith('k1', 'status-transition', TX);
  });

  it('writes the idempotency key inside the transaction, not after the side effects', async () => {
    const uc = makeUseCase();

    const result = await uc.executeInTransaction(
      { appointmentId: 'appt-1', targetStatus: 'SCHEDULED', idempotencyKey: 'k1', actor: OP_ACTOR },
      TX,
    );

    // Already written before any effect ran — and with the tx, so a rollback
    // takes it with them.
    expect(idempotencyService.set).toHaveBeenCalledWith(
      'k1', 'status-transition', expect.anything(), 24, undefined, TX,
    );
    expect(onTransitionHandler.execute).not.toHaveBeenCalled();

    await result.runAfterCommit();
  });

  it('still short-circuits on a cached idempotent result', async () => {
    const cached = { id: 'appt-1', status: 'SCHEDULED' };
    idempotencyService.get.mockResolvedValue(cached);
    const uc = makeUseCase();

    const result = await uc.executeInTransaction(
      { appointmentId: 'appt-1', targetStatus: 'SCHEDULED', idempotencyKey: 'k1', actor: OP_ACTOR },
      TX,
    );
    await result.runAfterCommit();

    expect(result.output).toBe(cached);
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(onTransitionHandler.execute).not.toHaveBeenCalled();
  });
});

describe('execute — unchanged for every existing caller', () => {
  it('runs the write and all the side effects, and returns the output', async () => {
    const uc = makeUseCase();

    const output = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      actor: OP_ACTOR,
    });

    expect(output.status).toBe('SCHEDULED');
    expect(output.previousStatus).toBe('AWAITING_INSPECTOR');
    expect(appointmentRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalled();
    expect(onTransitionHandler.execute).toHaveBeenCalled();
    expect(domainEventBus.emit).toHaveBeenCalled();
  });

  it('passes no transaction when none was given', async () => {
    const uc = makeUseCase();

    await uc.execute({ appointmentId: 'appt-1', targetStatus: 'SCHEDULED', actor: OP_ACTOR });

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1', undefined);
  });

  it('keeps a notification failure from failing the transition', async () => {
    onTransitionHandler.execute.mockRejectedValue(new Error('smtp down'));
    const uc = makeUseCase();

    await expect(
      uc.execute({ appointmentId: 'appt-1', targetStatus: 'SCHEDULED', actor: OP_ACTOR }),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification.dispatch_failed' }),
    );
  });
});
