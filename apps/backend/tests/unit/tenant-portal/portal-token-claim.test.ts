import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/confirm-appointment.use-case';
import { ReportUnavailabilityUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/report-unavailability.use-case';
import { JoinGroupUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/join-group.use-case';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { PortalTokenAlreadyUsedError, PortalAppointmentInactiveError } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

// Freeze "now" so the mock scheduledDate stays in the future and the 30-day
// reschedule window guard never trips on CI date drift (same convention as
// gap-002-003-004.test.ts).
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'stype-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-04-15'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 70,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    deletedAt: null,
    ...overrides,
  });
}

function makeTokenRepo() {
  return {
    findByTokenHash: vi.fn(),
    findActiveByAppointmentId: vi.fn(),
    save: vi.fn(),
    revokeAndSave: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn(),
    updateLastAccessedAt: vi.fn(),
    tryClaim: vi.fn().mockResolvedValue(true),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
    expireActiveTokens: vi.fn().mockResolvedValue(0),
  };
}

function makeActivityRepo() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
  };
}

function makeAppointmentRepo(appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return {
    findById: vi.fn().mockResolvedValue({
      appointment: makeAppointment(appointmentOverrides),
      contact: null,
      contacts: [],
      restrictions: [],
    }),
    update: vi.fn().mockResolvedValue(undefined),
    saveRestriction: vi.fn().mockResolvedValue(undefined),
    deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
    replaceRestrictions: vi.fn().mockResolvedValue(undefined),
  };
}

const auditService = () => ({ log: vi.fn() }) as unknown as PersistentAuditService;

// =========================================================================
// ConfirmAppointmentUseCase
// =========================================================================

describe('ConfirmAppointmentUseCase atomic token claim', () => {
  function build() {
    const activityRepo = makeActivityRepo();
    const appointmentRepo = makeAppointmentRepo();
    const tokenRepo = makeTokenRepo();
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const useCase = new ConfirmAppointmentUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
      undefined,
      logger as any,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isPastConfirmCutoff: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, tokenRepo, logger, input };
  }

  it('claims the token atomically before any side effect, then hands it back', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    // The claim is released on success so the same link can still change time
    // afterwards (symmetry with the decline path). The "already CONFIRMED"
    // short-circuit is the replay guard, not a permanently consumed token.
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(appointmentRepo.deleteRestrictionsByAppointmentId).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('succeeds but logs when the post-confirmation claim release fails', async () => {
    // The confirmation is already committed by the time the claim is handed
    // back, so a release failure must not surface as an error to the tenant —
    // but the stranded link is an operational fact that must be logged.
    const { useCase, tokenRepo, logger, input } = build();
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-1', tokenId: 'token-1' }),
      expect.stringContaining('release the portal token'),
    );
  });

  it('does not re-apply when a concurrent confirm already completed (post-claim re-read)', async () => {
    // Race: this request read the appointment as PENDING, then a concurrent
    // confirm committed and handed the claim back. After winning the claim, the
    // re-read now sees CONFIRMED, so this request must short-circuit idempotently
    // instead of emitting a duplicate activity / audit / notification / event.
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    appointmentRepo.findById
      .mockResolvedValueOnce({ appointment: makeAppointment(), contact: null, contacts: [], restrictions: [] })
      .mockResolvedValueOnce({ appointment: makeAppointment({ rentalTenantConfirmationStatus: 'CONFIRMED' }), contact: null, contacts: [], restrictions: [] });

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
  });

  it('releases the claim and throws inactive when the appointment turned terminal after the claim', async () => {
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    appointmentRepo.findById
      .mockResolvedValueOnce({ appointment: makeAppointment(), contact: null, contacts: [], restrictions: [] })
      .mockResolvedValueOnce({ appointment: makeAppointment({ status: 'CANCELLED' }), contact: null, contacts: [], restrictions: [] });

    await expect(useCase.execute(input)).rejects.toThrow(PortalAppointmentInactiveError);

    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
  });

  it('releases the claim when the post-claim re-read itself fails', async () => {
    // The claim is already held at this point, so a transient read failure must
    // not strand the token — otherwise it reintroduces the very bug this fixes.
    const { useCase, tokenRepo, appointmentRepo, input } = build();
    appointmentRepo.findById
      .mockResolvedValueOnce({ appointment: makeAppointment(), contact: null, contacts: [], restrictions: [] })
      .mockRejectedValueOnce(new Error('db read failed'));

    await expect(useCase.execute(input)).rejects.toThrow('db read failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('applies the confirmation against the fresh post-claim read, not the pre-claim snapshot', async () => {
    const { useCase, appointmentRepo, input } = build();
    const operatorRestriction = {
      id: 'restr-1', appointmentId: 'appt-1', isHome: true,
      unavailableDaysJson: null, unavailableHoursJson: null,
      availableSlotsJson: [{ date: '2026-04-16', timeSlotStart: '09:00', timeSlotEnd: '12:00' }],
      notes: null, source: 'OPERATOR', createdAt: new Date(), updatedAt: new Date(),
    };
    // Pre-claim read has no restrictions; the fresh read gains an operator one.
    appointmentRepo.findById
      .mockResolvedValueOnce({ appointment: makeAppointment(), contact: null, contacts: [], restrictions: [] })
      .mockResolvedValueOnce({ appointment: makeAppointment(), contact: null, contacts: [], restrictions: [operatorRestriction] });

    await useCase.execute(input);

    // Using the stale pre-claim read would pass null; the fresh read preserves
    // the operator restriction (with its offered availability dropped).
    expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({ source: 'OPERATOR', availableSlotsJson: null }),
    );
  });

  it('does not claim the token on the idempotent already-CONFIRMED path', async () => {
    const { activityRepo, tokenRepo, input } = build();
    const appointmentRepo = makeAppointmentRepo({ rentalTenantConfirmationStatus: 'CONFIRMED' });
    const useCase = new ConfirmAppointmentUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');
  });
});

// =========================================================================
// ReportUnavailabilityUseCase
// =========================================================================

describe('ReportUnavailabilityUseCase atomic token claim', () => {
  function build() {
    const activityRepo = makeActivityRepo();
    const appointmentRepo = makeAppointmentRepo();
    const tokenRepo = makeTokenRepo();
    const useCase = new ReportUnavailabilityUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      { execute: vi.fn().mockResolvedValue({}) },
      undefined,
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isPastConfirmCutoff: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, tokenRepo, input };
  }

  it('claims the token atomically before any side effect, then hands it back', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    // Like confirm (but unlike join), the claim is released on success: a
    // decline auto-rejects the appointment, and the tenant still needs this link
    // to pick another time. The claim only serialises concurrent declines; the
    // "already UNAVAILABLE" short-circuit is the replay guard.
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('does not claim the token on the idempotent already-UNAVAILABLE path', async () => {
    const { activityRepo, tokenRepo, input } = build();
    const appointmentRepo = makeAppointmentRepo({ rentalTenantConfirmationStatus: 'UNAVAILABLE' });
    const useCase = new ReportUnavailabilityUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      { execute: vi.fn().mockResolvedValue({}) },
      undefined,
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');
  });
});

// =========================================================================
// JoinGroupUseCase
// =========================================================================

describe('JoinGroupUseCase atomic token claim', () => {
  function makeGroup() {
    return new ServiceGroupEntity({
      id: 'sg-new',
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      status: 'ACCEPTED',
      groupSize: 10,
      offeredCount: 3,
      confirmedCount: 3,
      scheduledDate: new Date('2026-04-20'),
      timeWindow: '09:00-12:00',
      name: null,
      regionName: null,
      description: null,
      assignedInspectorId: 'insp-1',
      serviceRegionId: null,
      publishedAt: null,
      assignedAt: null,
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function build() {
    const activityRepo = makeActivityRepo();
    const tokenRepo = makeTokenRepo();
    const appointmentRepo = makeAppointmentRepo({ propertyId: 'prop-1' });
    const serviceGroupRepo = {
      findById: vi.fn().mockResolvedValue({
        group: makeGroup(),
        assignedInspectorName: 'John Smith',
        tenantIds: ['tenant-1'],
        appointments: [],
      }),
      findPortalEligibleSlots: vi.fn().mockResolvedValue([
        {
          groupId: 'sg-new',
          scheduledDate: new Date('2026-04-20T00:00:00.000Z'),
          timeSlotStart: '13:00',
          timeSlotEnd: '15:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          isOwnAgency: true,
        },
      ]),
      reservePortalWindow: vi.fn().mockResolvedValue({ ok: true }),
      hasPortalMemberSlot: vi.fn().mockResolvedValue(true),
      decrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
      incrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
    };
    const statusTransition = {
      execute: vi.fn().mockResolvedValue({
        id: 'appt-1',
        status: 'SCHEDULED',
        previousStatus: 'AWAITING_INSPECTOR',
        reason: null,
        inspectorId: 'insp-1',
        doneCheckedByUserId: null,
        doneCheckedAt: null,
        updatedAt: new Date(),
      }),
      // The join now composes the hops into its own transaction, so it drives
      // the two-phase entry point rather than execute().
      executeInTransaction: vi.fn().mockResolvedValue({
        output: { id: 'appt-1', status: 'SCHEDULED' },
        runAfterCommit: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const useCase = new JoinGroupUseCase(
      appointmentRepo as any,
      serviceGroupRepo as any,
      activityRepo as any,
      tokenRepo as any,
      auditService(),
      statusTransition as any,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      groupId: 'sg-new',
      scheduledDate: '2026-04-20',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, serviceGroupRepo, statusTransition, tokenRepo, input };
  }

  it('claims the token atomically before any side effect', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, serviceGroupRepo, statusTransition, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(serviceGroupRepo.decrementConfirmedCount).not.toHaveBeenCalled();
    expect(serviceGroupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
    expect(statusTransition.execute).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, serviceGroupRepo, tokenRepo, input } = build();
    serviceGroupRepo.incrementConfirmedCount.mockRejectedValue(new Error('increment failed'));

    await expect(useCase.execute(input)).rejects.toThrow('increment failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, serviceGroupRepo, tokenRepo, input } = build();
    serviceGroupRepo.incrementConfirmedCount.mockRejectedValue(new Error('increment failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('increment failed');
  });
});
