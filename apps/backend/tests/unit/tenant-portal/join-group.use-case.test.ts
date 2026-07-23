import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JoinGroupUseCase,
  type JoinGroupInput,
} from '../../../src/modules/rental-tenant-portal/application/use-cases/join-group.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
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
    hasPortalMemberSlot: ReturnType<typeof vi.fn>;
    decrementConfirmedCount: ReturnType<typeof vi.fn>;
    incrementConfirmedCount: ReturnType<typeof vi.fn>;
  };
  let activityRepo: { save: ReturnType<typeof vi.fn> };
  let tokenRepo: { tryClaim: ReturnType<typeof vi.fn>; releaseClaim: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let statusTransition: { execute: ReturnType<typeof vi.fn> };
  let notificationHandler: { execute: ReturnType<typeof vi.fn> };
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
      findPortalEligibleSlots: vi.fn().mockResolvedValue([
        {
          groupId: 'sg-new',
          scheduledDate: new Date('2026-06-02T00:00:00.000Z'),
          timeSlotStart: '13:00',
          timeSlotEnd: '15:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          confirmedCount: 3,
          capacityMax: 10,
        },
      ]),
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

    useCase = new JoinGroupUseCase(
      appointmentRepo as any,
      serviceGroupRepo as any,
      activityRepo as any,
      tokenRepo as any,
      auditService as any,
      statusTransition as any,
      notificationHandler,
    );
  });

  it('should allow joining a group after the portal token expired (isReadOnly)', async () => {
    const result = await useCase.execute(makeInput());
    expect(result.appointmentStatus).toBe('SCHEDULED');
  });

  it('should throw PortalAppointmentInactiveError for finalized appointments', async () => {
    for (const status of ['DONE', 'CANCELLED', 'REJECTED'] as const) {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ status }),
        contact: null,
        restrictions: [],
      });
      await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
    }
  });

  it('should throw PortalTokenAlreadyUsedError when isUsed', async () => {
    await expect(useCase.execute(makeInput({ isUsed: true }))).rejects.toThrow(PortalTokenAlreadyUsedError);
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

  it('should throw PortalGroupFullError when group confirmedCount >= 10', async () => {
    serviceGroupRepo.findById.mockResolvedValue({
      group: makeGroup({ confirmedCount: 10 }),
      assignedInspectorName: 'John',
      tenantIds: ['tenant-1'],
      appointments: [],
    });
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
      {
        groupId: 'sg-new',
        scheduledDate: new Date('2026-06-03T00:00:00.000Z'),
        timeSlotStart: '16:00',
        timeSlotEnd: '17:00',
        suburb: 'Surry Hills',
        inspectorName: 'John Smith',
        confirmedCount: 3,
        capacityMax: 10,
      },
    ]);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalGroupSlotUnavailableError);
    expect(serviceGroupRepo.hasPortalMemberSlot).not.toHaveBeenCalled();
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
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', expect.objectContaining({
      scheduledDate: new Date('2026-06-02'),
      timeSlotStart: '13:00', timeSlotEnd: '15:00',
      inspectorId: 'insp-1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      serviceGroupId: 'sg-new',
    }));
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
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', expect.objectContaining({
      rentalTenantNote: 'Please ring bell',
    }));
  });
});
