import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JoinGroupUseCase,
  type JoinGroupInput,
} from '../../../src/modules/rental-tenant-portal/application/use-cases/join-group.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ConfirmationCycleNotFoundError } from '../../../src/modules/appointment/domain/confirmation-cycle.errors';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import {
  PortalAppointmentInactiveError,
  PortalTokenAlreadyUsedError,
  PortalGroupNotFoundError,
  PortalGroupFullError,
  PortalGroupUnavailableError,
  PortalGroupSlotUnavailableError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'stype-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-05-30'),
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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeGroup(overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {}) {
  return new ServiceGroupEntity({
    id: 'sg-new',
    tenantId: 'tenant-1',
    serviceTypeId: 'stype-1',
    status: 'ACCEPTED',
    groupSize: 10,
    offeredCount: 3,
    confirmedCount: 3,
    scheduledDate: new Date('2026-05-31'),
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
    ...overrides,
  });
}

/** One member appointment of the target group, as the repository now returns it. */
function makeEligibleMember(overrides: Record<string, unknown> = {}) {
  return {
    groupId: 'sg-new',
    scheduledDate: new Date('2026-06-02T00:00:00.000Z'),
    timeSlotStart: '13:00',
    timeSlotEnd: '15:00',
    suburb: 'Surry Hills',
    inspectorName: 'John Smith',
    isOwnAgency: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<JoinGroupInput> = {}): JoinGroupInput {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    groupId: 'sg-new',
    scheduledDate: '2026-06-02',
    timeSlotStart: '13:00',
    timeSlotEnd: '15:00',
    isUsed: false,
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

describe('JoinGroupUseCase', () => {
  let appointmentRepo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let serviceGroupRepo: {
    findById: ReturnType<typeof vi.fn>;
    findPortalEligibleSlots: ReturnType<typeof vi.fn>;
    reservePortalWindow: ReturnType<typeof vi.fn>;
    hasPortalMemberSlot: ReturnType<typeof vi.fn>;
    decrementConfirmedCount: ReturnType<typeof vi.fn>;
    incrementConfirmedCount: ReturnType<typeof vi.fn>;
  };
  let activityRepo: { save: ReturnType<typeof vi.fn> };
  let tokenRepo: { tryClaim: ReturnType<typeof vi.fn>; releaseClaim: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let statusTransition: { execute: ReturnType<typeof vi.fn> };
  let notificationHandler: { execute: ReturnType<typeof vi.fn> };
  let cancelEmptyGroup: { cancelIfDead: ReturnType<typeof vi.fn> };
  let cycleService: {
    realignActiveCycleSchedule: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let useCase: JoinGroupUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact: null,
        restrictions: [],
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    serviceGroupRepo = {
      findById: vi.fn().mockResolvedValue({
        group: makeGroup(),
        assignedInspectorName: 'John Smith',
        tenantIds: ['tenant-1'],
        appointments: [],
      }),
      findPortalEligibleSlots: vi.fn().mockResolvedValue([makeEligibleMember()]),
      reservePortalWindow: vi.fn().mockResolvedValue({ ok: true }),
      hasPortalMemberSlot: vi.fn().mockResolvedValue(true),
      decrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
      incrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
    };
    activityRepo = { save: vi.fn().mockResolvedValue(undefined) };
    tokenRepo = { tryClaim: vi.fn().mockResolvedValue(true), releaseClaim: vi.fn().mockResolvedValue(undefined) };
    auditService = { log: vi.fn().mockResolvedValue(undefined) };
    statusTransition = {
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
    };
    notificationHandler = { execute: vi.fn().mockResolvedValue(undefined) };
    cancelEmptyGroup = { cancelIfDead: vi.fn().mockResolvedValue(false) };
    cycleService = {
      realignActiveCycleSchedule: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    useCase = new JoinGroupUseCase(
      appointmentRepo as any,
      serviceGroupRepo as any,
      activityRepo as any,
      tokenRepo as any,
      auditService as any,
      statusTransition as any,
      notificationHandler,
      cancelEmptyGroup,
      cycleService as any,
      logger as any,
    );
  });

  // The tenant moving groups can leave the old one with nothing to execute. The
  // transition event carries the NEW group id, so the empty-group subscriber cannot
  // see this case — this flow has to check the vacated group itself.
  describe('vacated group cleanup', () => {
    it('checks the group the tenant left', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ serviceGroupId: 'old-group' }),
        contact: null,
        restrictions: [],
      });

      await useCase.execute(makeInput());

      expect(cancelEmptyGroup.cancelIfDead).toHaveBeenCalledWith('old-group');
    });

    it('does not check anything when the appointment had no group', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ serviceGroupId: null }),
        contact: null,
        restrictions: [],
      });

      await useCase.execute(makeInput());

      expect(cancelEmptyGroup.cancelIfDead).not.toHaveBeenCalled();
    });

    it('still completes the join when the cleanup rejects', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ serviceGroupId: 'old-group' }),
        contact: null,
        restrictions: [],
      });
      cancelEmptyGroup.cancelIfDead.mockRejectedValue(new Error('db down'));

      await expect(useCase.execute(makeInput())).resolves.toBeDefined();
    });

    it('does not make the tenant wait on the cleanup', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ serviceGroupId: 'old-group' }),
        contact: null,
        restrictions: [],
      });
      // A cleanup that never settles must not hold the join response open.
      cancelEmptyGroup.cancelIfDead.mockReturnValue(new Promise(() => {}));

      await expect(useCase.execute(makeInput())).resolves.toBeDefined();
      expect(cancelEmptyGroup.cancelIfDead).toHaveBeenCalledWith('old-group');
    });
  });

  it('should allow joining a group after the portal token expired (isReadOnly)', async () => {
    const result = await useCase.execute(makeInput());
    expect(result.appointmentStatus).toBe('SCHEDULED');
  });

  // A portal decline auto-rejects the appointment, so "change time" has to be
  // able to climb back out of REJECTED — otherwise declining is a dead end.
  describe('rejoining from REJECTED', () => {
    beforeEach(() => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ status: 'REJECTED' }),
        contact: null,
        restrictions: [],
      });
    });

    it('climbs out via AWAITING_INSPECTOR, since REJECTED → SCHEDULED does not exist', async () => {
      const result = await useCase.execute(makeInput());

      expect(statusTransition.execute).toHaveBeenCalledTimes(2);
      expect(statusTransition.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          targetStatus: 'AWAITING_INSPECTOR',
          // The recovery rule requires a reason for every actor, SYS included.
          reason: expect.any(String),
          actor: expect.objectContaining({ role: 'SYS' }),
        }),
      );
      expect(statusTransition.execute).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ targetStatus: 'SCHEDULED' }),
      );
      expect(result.appointmentStatus).toBe('SCHEDULED');
    });

    it('takes the new slot before transitioning, so the group guard sees a live group', async () => {
      const order: string[] = [];
      serviceGroupRepo.reservePortalWindow.mockImplementation(async () => {
        order.push('reserve');
        return { ok: true };
      });
      statusTransition.execute.mockImplementation(async () => {
        order.push('transition');
        return { status: 'SCHEDULED' };
      });

      await useCase.execute(makeInput());

      expect(order[0]).toBe('reserve');
    });

    it('decides the hops on a status read AFTER the claim, not before it', async () => {
      // Race: this join reads SCHEDULED, then a decline rejects the appointment
      // and hands the token back, then this join claims it. reservePortalWindow
      // now admits REJECTED, so acting on the stale SCHEDULED would skip both
      // hops and leave a REJECTED appointment sitting in a live group — wrong,
      // and silent. Both gates that used to fail this closed were opened by the
      // auto-reject work, so the fresh read is the only thing left guarding it.
      appointmentRepo.findById
        .mockResolvedValueOnce({
          appointment: makeAppointment({ status: 'SCHEDULED' }),
          contact: null,
          restrictions: [],
        })
        .mockResolvedValue({
          appointment: makeAppointment({ status: 'REJECTED' }),
          contact: null,
          restrictions: [],
        });

      const result = await useCase.execute(makeInput());

      expect(statusTransition.execute).toHaveBeenCalledTimes(2);
      expect(statusTransition.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ targetStatus: 'AWAITING_INSPECTOR' }),
      );
      expect(result.appointmentStatus).toBe('SCHEDULED');
    });

    it('still uses a single transition when the appointment was merely awaiting an inspector', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ status: 'AWAITING_INSPECTOR' }),
        contact: null,
        restrictions: [],
      });

      await useCase.execute(makeInput());

      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).toHaveBeenCalledWith(
        expect.objectContaining({ targetStatus: 'SCHEDULED' }),
      );
    });
  });

  describe('confirmation cycle', () => {
    it('realigns and confirms the cycle, so it cannot disagree with the denormalized status', async () => {
      // reservePortalWindow writes rental_tenant_confirmation_status directly.
      // Without this the cycle row would still read UNAVAILABLE after a decline
      // while the appointment column reads CONFIRMED.
      await useCase.execute(makeInput());

      expect(cycleService.realignActiveCycleSchedule).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.any(Date),
        '13:00-15:00',
      );
      expect(cycleService.confirm).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        'RENTAL_TENANT_PORTAL',
        'token-1',
      );
    });

    it('does not fail the join when the cycle is missing', async () => {
      cycleService.confirm.mockRejectedValue(new ConfirmationCycleNotFoundError());

      const result = await useCase.execute(makeInput());

      expect(result.appointmentStatus).toBe('SCHEDULED');
      // Expected for a pre-cycle appointment — not worth logging.
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs when the cycle fails for any other reason, since the two then diverge', async () => {
      cycleService.confirm.mockRejectedValue(new Error('db down'));

      const result = await useCase.execute(makeInput());

      expect(result.appointmentStatus).toBe('SCHEDULED');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('reservation committed but the transition failed', () => {
    it('logs the inconsistent state instead of letting it vanish into the 500', async () => {
      // reservePortalWindow commits in its own transaction, so this leaves the
      // appointment in the new group with a stale status and nothing can roll
      // it back from here.
      statusTransition.execute.mockRejectedValue(new Error('transition exploded'));

      await expect(useCase.execute(makeInput())).rejects.toThrow('transition exploded');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'appt-1', groupId: 'sg-new' }),
        expect.stringContaining('needs manual repair'),
      );
    });
  });

  it('should throw PortalAppointmentInactiveError for finalized appointments', async () => {
    // REJECTED is deliberately absent: a tenant who declined can still pick
    // another time, and that rejoin is what revives the appointment.
    for (const status of ['DONE', 'CANCELLED', 'DRAFT'] as const) {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ status }),
        contact: null,
        restrictions: [],
      });
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
    }
  });

  it('should throw PortalTokenAlreadyUsedError when the claim cannot be taken', async () => {
    // `isUsed` is a stale read; the conditional write is the authoritative guard.
    tokenRepo.tryClaim.mockResolvedValue(false);
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalTokenAlreadyUsedError);
  });

  it('lets a tenant who already answered once still change time', async () => {
    // Reporting unavailability hands the link back precisely so this works.
    const result = await useCase.execute(makeInput({ isUsed: true }));
    expect(result.appointmentStatus).toBe('SCHEDULED');
  });

  it('should throw PortalGroupNotFoundError when group not found', async () => {
    serviceGroupRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupNotFoundError);
  });

  it('should throw PortalGroupNotFoundError when the appointment agency is not in the group', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup(),
      assignedInspectorName: 'John',
      tenantIds: ['other-tenant'],
      appointments: [],
    });
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupNotFoundError);
  });

  it('should throw PortalGroupNotFoundError when group has different serviceType', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup({ serviceTypeId: 'other-stype' }),
      assignedInspectorName: 'John',
      tenantIds: ['tenant-1'],
      appointments: [],
    });
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupNotFoundError);
  });

  it('should throw PortalGroupFullError when the selected window has no room left', async () => {
    // 13:00-15:00 fits four inspections at two per hour; four members fill it.
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeEligibleMember(), makeEligibleMember(), makeEligibleMember(), makeEligibleMember(),
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('should throw PortalGroupFullError when an enclosing window is saturated', async () => {
    // 13:00-15:00 looks half empty, but 13:00-16:00 holds six of its six slots,
    // so there is nowhere left to actually put the visit.
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeEligibleMember(),
      ...Array.from({ length: 6 }, () => makeEligibleMember({ timeSlotStart: '13:00', timeSlotEnd: '16:00' })),
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);
  });

  it('should join a group whose confirmed_count already exceeds the retired cap of 10', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup({ confirmedCount: 12 }),
      assignedInspectorName: 'John Smith',
      tenantIds: ['tenant-1'],
      appointments: [],
    });

    const result = await useCase.execute(makeInput());
    expect(result.appointmentStatus).toBe('SCHEDULED');
  });

  it('should count another agency towards the window before letting the tenant in', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeEligibleMember(),
      ...Array.from({ length: 3 }, () => makeEligibleMember({ isOwnAgency: false })),
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);
  });

  it('should throw PortalGroupUnavailableError when group is CANCELLED', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup({ status: 'CANCELLED' }),
      assignedInspectorName: 'John',
      tenantIds: ['tenant-1'],
      appointments: [],
    });
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupUnavailableError);
  });

  it('should throw PortalGroupUnavailableError when group has no inspector', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup({ assignedInspectorId: null }),
      assignedInspectorName: null,
      tenantIds: ['tenant-1'],
      appointments: [],
    });
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupUnavailableError);
  });

  it('should throw PortalGroupSlotUnavailableError when joining the appointment own group', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'SCHEDULED', serviceGroupId: 'sg-new' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupSlotUnavailableError);
    expect(serviceGroupRepo.findPortalEligibleSlots).not.toHaveBeenCalled();
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('should exclude the previous group from the eligible-slot whitelist', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'SCHEDULED', serviceGroupId: 'sg-old' }),
      contact: null,
      restrictions: [],
    });

    await useCase.execute(makeInput());
    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ excludeGroupId: 'sg-old' }),
    );
  });

  it('should throw PortalGroupSlotUnavailableError when selected slot is not a current member appointment slot', async () => {
    serviceGroupRepo.hasPortalMemberSlot.mockResolvedValue(false);
    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupSlotUnavailableError);
  });

  it('should throw PortalGroupSlotUnavailableError when selected slot is not eligible for the portal appointment', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeEligibleMember({
        scheduledDate: new Date('2026-06-03T00:00:00.000Z'),
        timeSlotStart: '16:00',
        timeSlotEnd: '17:00',
      }),
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupSlotUnavailableError);
    expect(serviceGroupRepo.hasPortalMemberSlot).not.toHaveBeenCalled();
  });

  it('should not offer a window held only by another agency', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeEligibleMember({ isOwnAgency: false }),
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupSlotUnavailableError);
  });

  it('should return correct output on happy path', async () => {
    const result = await useCase.execute(makeInput());
    expect(result).toMatchObject({
      scheduledDate: '2026-06-02',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      appointmentStatus: 'SCHEDULED',
      inspector: { id: 'insp-1', name: 'John Smith' },
    });
  });

  it('should update appointment with group details', async () => {
    await useCase.execute(makeInput());
    // The write happens inside the reservation so it shares the transaction
    // that re-checked capacity under a lock.
    expect(serviceGroupRepo.reservePortalWindow).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'sg-new',
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      scheduledDate: '2026-06-02',
      timeSlotStart: '13:00', timeSlotEnd: '15:00',
      inspectorId: 'insp-1',
    }));
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('should increment confirmed_count of new group', async () => {
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.incrementConfirmedCount).toHaveBeenCalledWith('sg-new');
  });

  it('should validate the selected slot tuple against group member appointments', async () => {
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
    }));
    expect(serviceGroupRepo.hasPortalMemberSlot).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'sg-new',
      scheduledDate: '2026-06-02',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
    }));
  });

  it('should decrement confirmed_count of previous group when appointment was in one', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ serviceGroupId: 'sg-old', status: 'SCHEDULED' }),
      contact: null,
      restrictions: [],
    });
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.decrementConfirmedCount).toHaveBeenCalledWith('sg-old');
  });

  it('should NOT decrement when appointment had no previous group', async () => {
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.decrementConfirmedCount).not.toHaveBeenCalled();
  });

  it('should record GROUP_JOIN activity', async () => {
    await useCase.execute(makeInput());
    expect(activityRepo.save).toHaveBeenCalledTimes(1);
    const activity = activityRepo.save.mock.calls[0][0];
    expect(activity.action).toBe('GROUP_JOIN');
    expect(activity.ipAddress).toBe('127.0.0.1');
  });

  it('should mark token as used', async () => {
    await useCase.execute(makeInput());
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('should call audit service with ANONYMOUS actor', async () => {
    await useCase.execute(makeInput());
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rental_tenant_portal.group_joined',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: 'appt-1',
      tenantId: 'tenant-1',
    }));
  });

  it('should call state transition with SYS actor when appointment is AWAITING_INSPECTOR', async () => {
    await useCase.execute(makeInput());
    expect(statusTransition.execute).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      actor: expect.objectContaining({ role: 'SYS' }),
    }));
  });

  // BUG-3 regression: SCHEDULED appointment switching group must NOT re-trigger the
  // SCHEDULED→SCHEDULED transition (APPOINTMENT_INVALID_TRANSITION). Only
  // AWAITING_INSPECTOR→SCHEDULED is a valid forward transition.
  it('should NOT call state transition when appointment is already SCHEDULED', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'SCHEDULED', serviceGroupId: 'sg-old' }),
      contact: null,
      restrictions: [],
    });
    await useCase.execute(makeInput());
    expect(statusTransition.execute).not.toHaveBeenCalled();
  });

  it('should swallow notification failures', async () => {
    notificationHandler.execute.mockRejectedValue(new Error('Queue failure'));
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
  });

  it('should store rentalTenantNote when provided', async () => {
    await useCase.execute(makeInput({ rentalTenantNote: 'Please ring bell' }));
    expect(serviceGroupRepo.reservePortalWindow).toHaveBeenCalledWith(expect.objectContaining({
      rentalTenantNote: 'Please ring bell',
    }));
  });

  describe('losing the capacity race', () => {
    beforeEach(() => {
      // The pre-check passed, but another tenant took the last opening before
      // this transaction got the group lock.
      serviceGroupRepo.reservePortalWindow.mockResolvedValue({ ok: false, reason: 'WINDOW_FULL' });
    });

    it('should throw PortalGroupFullError', async () => {
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);
    });

    it('should leave the appointment in its previous group', async () => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ status: 'SCHEDULED', serviceGroupId: 'sg-old' }),
        contact: null,
        restrictions: [],
      });

      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);

      // Detaching before the slot is held would strand the tenant in neither group.
      expect(serviceGroupRepo.decrementConfirmedCount).not.toHaveBeenCalled();
      expect(serviceGroupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
      expect(statusTransition.execute).not.toHaveBeenCalled();
      expect(activityRepo.save).not.toHaveBeenCalled();
    });

    it('should release the token so the tenant can pick another time', async () => {
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupFullError);
      expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    });
  });

  describe('when the appointment goes inactive mid-flight', () => {
    beforeEach(() => {
      // Cancelled or deleted between the caller's status check and the
      // reservation transaction, so there is nothing left to move.
      serviceGroupRepo.reservePortalWindow.mockResolvedValue({
        ok: false,
        reason: 'APPOINTMENT_INACTIVE',
      });
    });

    it('should report it as inactive, not as a full window', async () => {
      // Saying "full" would send the tenant round the picker to fail again.
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
    });

    it('should run no side effect for a move that never happened', async () => {
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);

      expect(serviceGroupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
      expect(serviceGroupRepo.decrementConfirmedCount).not.toHaveBeenCalled();
      expect(statusTransition.execute).not.toHaveBeenCalled();
      expect(activityRepo.save).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(notificationHandler.execute).not.toHaveBeenCalled();
    });
  });
});
