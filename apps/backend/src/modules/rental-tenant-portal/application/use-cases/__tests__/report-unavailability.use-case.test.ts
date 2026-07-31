import { describe, it, expect, vi } from 'vitest';
import { ReportUnavailabilityUseCase } from '../report-unavailability.use-case';
import { PortalAppointmentInactiveError } from '../../../domain/rental-tenant-portal.errors';

function makeUseCase(overrides: { status?: string; rentalTenantConfirmationStatus?: string } = {}) {
  const appointment = {
    id: 'appt-1',
    tenantId: 'tenant-1',
    status: overrides.status ?? 'SCHEDULED',
    rentalTenantConfirmationStatus: overrides.rentalTenantConfirmationStatus ?? 'PENDING',
  };
  const activityRepo = { save: vi.fn() };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({ appointment, contact: null, contacts: [], restrictions: [] }),
    update: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    replaceRestrictions: vi.fn(),
    saveRestriction: vi.fn(),
  };
  const auditService = { log: vi.fn() };
  const tokenRepo = {
    tryClaim: vi.fn().mockResolvedValue(true),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
  };
  const statusTransition = { execute: vi.fn().mockResolvedValue({}) };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const uc = new ReportUnavailabilityUseCase(
    activityRepo as any,
    appointmentRepo as any,
    auditService as any,
    statusTransition as any,
    undefined,
    undefined,
    undefined,
    tokenRepo as any,
    undefined,
    logger as any,
  );
  return { uc, auditService, appointmentRepo, tokenRepo, statusTransition, logger };
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

describe('ReportUnavailabilityUseCase — urgentMode derives from the confirm cutoff', () => {
  it('reports urgentMode=true past the confirm cutoff (token still valid)', async () => {
    const { uc, auditService } = makeUseCase();

    const result = await uc.execute({ ...BASE_INPUT, isPastConfirmCutoff: true });

    expect(result.urgentMode).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ urgentMode: true }) }),
    );
  });

  it('reports urgentMode=false before the cutoff', async () => {
    const { uc } = makeUseCase();

    const result = await uc.execute(BASE_INPUT);

    expect(result.urgentMode).toBe(false);
  });
});

describe('ReportUnavailabilityUseCase — a decline rejects the appointment', () => {
  it('transitions SCHEDULED → REJECTED as the system actor with TENANT_DECLINED', async () => {
    const { uc, statusTransition } = makeUseCase({ status: 'SCHEDULED' });

    await uc.execute(BASE_INPUT);

    expect(statusTransition.execute).toHaveBeenCalledTimes(1);
    expect(statusTransition.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appt-1',
        targetStatus: 'REJECTED',
        rejectionReasonCode: 'TENANT_DECLINED',
        reason: expect.any(String),
        actor: expect.objectContaining({ role: 'SYS', tenantId: 'tenant-1' }),
      }),
    );
  });

  it('rejects from AWAITING_INSPECTOR too', async () => {
    const { uc, statusTransition } = makeUseCase({ status: 'AWAITING_INSPECTOR' });

    await uc.execute(BASE_INPUT);

    expect(statusTransition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ targetStatus: 'REJECTED' }),
    );
  });

  it('keeps the confirmation status UNAVAILABLE, not NO_RESPONSE', async () => {
    // NO_RESPONSE is the T-1 sweep's label for a tenant who never replied. A
    // tenant who declined *did* reply, and left weekly availability behind.
    const { uc, appointmentRepo } = makeUseCase();

    const result = await uc.execute(BASE_INPUT);

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    const written = appointmentRepo.update.mock.calls.map((c) => c[2]);
    expect(written).toContainEqual(
      expect.objectContaining({ rentalTenantConfirmationStatus: 'UNAVAILABLE' }),
    );
    expect(JSON.stringify(written)).not.toContain('NO_RESPONSE');
  });

  it('is idempotent: a replayed decline on an already-rejected appointment does not transition again', async () => {
    const { uc, statusTransition } = makeUseCase({
      status: 'REJECTED',
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });

    await uc.execute(BASE_INPUT);

    expect(statusTransition.execute).not.toHaveBeenCalled();
  });

  it('heals a decline whose rejection never landed', async () => {
    // The confirmation-status write commits before the transition. If the
    // transition then failed, the appointment is UNAVAILABLE but still
    // SCHEDULED — and the plain idempotency short-circuit would report the
    // tenant's retry as a success while leaving it on the inspector's run
    // forever. The retry has to re-drive the rejection instead.
    const { uc, statusTransition } = makeUseCase({
      status: 'SCHEDULED',
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });

    const result = await uc.execute(BASE_INPUT);

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(statusTransition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ targetStatus: 'REJECTED', rejectionReasonCode: 'TENANT_DECLINED' }),
    );
  });

  it('does not re-reject an appointment that moved on to a dead status', async () => {
    const { uc, statusTransition } = makeUseCase({
      status: 'CANCELLED',
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });

    await uc.execute(BASE_INPUT);

    expect(statusTransition.execute).not.toHaveBeenCalled();
  });

  it('still persists the weekly availability the tenant submitted', async () => {
    const { uc, appointmentRepo } = makeUseCase();

    await uc.execute({
      ...BASE_INPUT,
      restrictions: {
        isHome: false,
        unavailableDaysJson: null,
        unavailableHoursJson: null,
        availableSlotsJson: [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }],
        notes: null,
      },
    });

    expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({
        source: 'RENTAL_TENANT_PORTAL',
        availableSlotsJson: [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }],
      }),
    );
  });
});

describe('ReportUnavailabilityUseCase — the portal link survives a decline', () => {
  it('releases the token claim so change-time still works afterwards', async () => {
    const { uc, tokenRepo } = makeUseCase();

    await uc.execute(BASE_INPUT);

    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('does not fail the decline when handing the link back fails', async () => {
    // Everything else is already committed at that point; a thrown error would
    // report a working decline as broken and the retry would short-circuit.
    const { uc, tokenRepo, logger } = makeUseCase();
    tokenRepo.releaseClaim.mockRejectedValue(new Error('db down'));

    await expect(uc.execute(BASE_INPUT)).resolves.toMatchObject({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
    // Swallowed, but never invisible.
    expect(logger.error).toHaveBeenCalled();
  });

  it('keeps the claim held when the decline itself fails', async () => {
    const { uc, tokenRepo, statusTransition } = makeUseCase();
    statusTransition.execute.mockRejectedValueOnce(new Error('boom'));

    await expect(uc.execute(BASE_INPUT)).rejects.toThrow('boom');

    // Exactly one release — the rollback path, not a second "keep it alive" call.
    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
  });
});

describe('ReportUnavailabilityUseCase — dead statuses', () => {
  it.each(['DRAFT', 'DONE', 'CANCELLED'])('refuses to act on %s', async (status) => {
    const { uc } = makeUseCase({ status });

    await expect(uc.execute(BASE_INPUT)).rejects.toBeInstanceOf(PortalAppointmentInactiveError);
  });
});
