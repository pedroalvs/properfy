import { describe, it, expect, vi } from 'vitest';
import { ConfirmAppointmentUseCase } from '../confirm-appointment.use-case';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
} from '../../../domain/rental-tenant-portal.errors';
import {
  ConfirmationCycleNotFoundError,
  ConfirmationCycleAlreadyTerminalError,
} from '../../../../appointment/domain/confirmation-cycle.errors';

function makeAppointment(overrides: Partial<{ status: string; rentalTenantConfirmationStatus: string }> = {}) {
  return {
    id: 'appt-1',
    tenantId: 'tenant-1',
    status: overrides.status ?? 'SCHEDULED',
    rentalTenantConfirmationStatus: overrides.rentalTenantConfirmationStatus ?? 'PENDING',
  };
}

function makeUseCase(appointment: ReturnType<typeof makeAppointment>) {
  const activityRepo = { save: vi.fn() };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({ appointment, contact: null, contacts: [], restrictions: [] }),
    update: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    replaceRestrictions: vi.fn(),
    saveRestriction: vi.fn(),
  };
  const auditService = { log: vi.fn() };
  const uc = new ConfirmAppointmentUseCase(activityRepo as any, appointmentRepo as any, auditService as any);
  return { uc, appointmentRepo, activityRepo };
}

const BASE_INPUT = {
  tokenId: 'token-1',
  appointmentId: 'appt-1',
  isReadOnly: false,
  isUsed: false,
  isPastConfirmCutoff: false,
  ipAddress: null,
  userAgent: null,
};

describe('ConfirmAppointmentUseCase — confirm cutoff and CANCELLED guards', () => {
  it('blocks confirmation past the confirm cutoff even with a valid token', async () => {
    const { uc, appointmentRepo } = makeUseCase(makeAppointment());

    await expect(uc.execute({ ...BASE_INPUT, isPastConfirmCutoff: true })).rejects.toThrow(
      PortalActionBlockedError,
    );
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('allows confirmation before the cutoff', async () => {
    const { uc } = makeUseCase(makeAppointment());

    const result = await uc.execute(BASE_INPUT);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
  });

  it('rejects a CANCELLED appointment', async () => {
    const { uc, appointmentRepo } = makeUseCase(makeAppointment({ status: 'CANCELLED' }));

    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(PortalAppointmentInactiveError);
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a CANCELLED appointment even when its confirmation status is a residual CONFIRMED', async () => {
    // Guard order matters: the idempotent "already confirmed" early-return must NOT
    // short-circuit the inactive-status check for cancelled appointments.
    const { uc } = makeUseCase(
      makeAppointment({ status: 'CANCELLED', rentalTenantConfirmationStatus: 'CONFIRMED' }),
    );

    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('rejects a CANCELLED appointment past the cutoff (both guards active)', async () => {
    const { uc } = makeUseCase(makeAppointment({ status: 'CANCELLED' }));

    await expect(uc.execute({ ...BASE_INPUT, isPastConfirmCutoff: true })).rejects.toThrow();
  });

  it('keeps the idempotent success for an active appointment already confirmed', async () => {
    const { uc, appointmentRepo, activityRepo } = makeUseCase(
      makeAppointment({ rentalTenantConfirmationStatus: 'CONFIRMED' }),
    );

    const result = await uc.execute(BASE_INPUT);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
  });
});

describe('ConfirmAppointmentUseCase — WI-B1: narrow the cycle-service fallback (#484, #495)', () => {
  function makeUseCaseWithCycle(confirmImpl: () => Promise<unknown>) {
    const appointment = makeAppointment();
    const activityRepo = { save: vi.fn() };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({ appointment, contact: null, contacts: [], restrictions: [] }),
      update: vi.fn(),
      replaceRestrictions: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const tokenRepo = {
      tryClaim: vi.fn().mockResolvedValue(true),
      releaseClaim: vi.fn().mockResolvedValue(undefined),
    };
    const cycleService = { confirm: vi.fn().mockImplementation(confirmImpl) };
    const uc = new ConfirmAppointmentUseCase(
      activityRepo as any,
      appointmentRepo as any,
      auditService as any,
      undefined,
      undefined,
      tokenRepo as any,
      cycleService as any,
    );
    return { uc, appointmentRepo, activityRepo, tokenRepo, cycleService };
  }

  it('rethrows a terminal-cycle error and does NOT fall back to a denorm write', async () => {
    const { uc, appointmentRepo, tokenRepo } = makeUseCaseWithCycle(() =>
      Promise.reject(new ConfirmationCycleAlreadyTerminalError()),
    );

    await expect(uc.execute(BASE_INPUT)).rejects.toBeInstanceOf(ConfirmationCycleAlreadyTerminalError);
    // The fallback must NOT convert a state-machine violation into a CONFIRMED write.
    expect(appointmentRepo.update).not.toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ rentalTenantConfirmationStatus: 'CONFIRMED' }),
    );
    // Documented retry contract: the token claim is released so the tenant can retry.
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('rethrows a transient DB error and does NOT fall back to a denorm write', async () => {
    const { uc, appointmentRepo } = makeUseCaseWithCycle(() => Promise.reject(new Error('db down')));

    await expect(uc.execute(BASE_INPUT)).rejects.toThrow('db down');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('falls back to the denorm write only for a missing cycle (pre-feature appointment)', async () => {
    const { uc, appointmentRepo } = makeUseCaseWithCycle(() =>
      Promise.reject(new ConfirmationCycleNotFoundError()),
    );

    const result = await uc.execute(BASE_INPUT);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ rentalTenantConfirmationStatus: 'CONFIRMED' }),
    );
  });
});
