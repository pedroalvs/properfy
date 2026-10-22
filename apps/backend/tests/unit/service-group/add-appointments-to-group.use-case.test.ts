import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { AddAppointmentsToGroupUseCase } from '../../../src/modules/service-group/application/use-cases/add-appointments-to-group.use-case';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { ServiceGroupTimeSyncLogger } from '../../../src/modules/service-group/application/sync-appointment-time-slot-to-group';
import { DomainEventBus, SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
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

function makeAppointmentWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(overrides),
    contact: null,
    contacts: [],
    restrictions: [],
    hasActivePortalToken: false,
  };
}

function makeGroupWithAppointments(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  appointments: ServiceGroupWithAppointments['appointments'] = [],
): ServiceGroupWithAppointments {
  const group = new ServiceGroupEntity({
    id: 'group-1',
    serviceTypeId: 'svc-type-1',
    status: 'DRAFT',
    groupSize: appointments.length,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
    timeWindow: '09:00-12:00',
    name: null,
    regionName: null,
    description: null,
    assignedInspectorId: null,
    serviceRegionId: null,
    publishedAt: null,
    assignedAt: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  return {
    group,
    tenantIds: ['tenant-1'],
    primaryTenantId: 'tenant-1',
    agencies: [{ id: 'tenant-1', name: 'Tenant 1' }],
    appointments,
  };
}

describe('AddAppointmentsToGroupUseCase', () => {
  let groupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let logger: ServiceGroupTimeSyncLogger;
  let eventBus: DomainEventBus;
  let useCase: AddAppointmentsToGroupUseCase;

  beforeEach(() => {
    groupRepo = {
      findById: vi.fn().mockResolvedValue(makeGroupWithAppointments()),
      linkAppointments: vi.fn().mockResolvedValue(1),
      incrementConfirmedCount: vi.fn(),
    } as unknown as IServiceGroupRepository;
    appointmentRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    } as unknown as IAppointmentRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { error: vi.fn() } as unknown as ServiceGroupTimeSyncLogger;
    eventBus = new DomainEventBus();
    useCase = new AddAppointmentsToGroupUseCase(
      groupRepo,
      appointmentRepo,
      auditService,
      new AuthorizationService(auditService),
      eventBus,
      logger,
    );
  });

  it('syncs time for an OK appointment outside the group time window', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '11:00', timeSlotEnd: '13:00' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], 'group-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
      before: { timeSlotStart: '11:00', timeSlotEnd: '13:00' },
      after: { timeSlotStart: '09:00', timeSlotEnd: '12:00' },
      reason: 'Added to service group',
      metadata: expect.objectContaining({ groupId: 'group-1', automaticTimeSlotSync: true }),
    }));
  });

  it('does not update time for an OK appointment fully inside the group time window', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], 'group-1');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.added_to_group',
      entityId: 'appt-1',
    }));
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps the linked OK result when legacy malformed time cannot be synced', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '010:00', timeSlotEnd: '11:00' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], 'group-1');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('keeps the linked OK result when the post-link time sync update fails', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
    );
    vi.mocked(appointmentRepo.update).mockRejectedValueOnce(new Error('sync failed'));

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], 'group-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    });
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
        groupId: 'group-1',
      }),
      'appointment schedule sync to group failed',
    );
  });

  it('replaces the appointment date with the group date when they differ', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({
        id: 'appt-1',
        scheduledDate: new Date('2026-08-05T00:00:00.000Z'),
        timeSlotStart: '09:30',
        timeSlotEnd: '10:30',
      }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], 'group-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
      before: { scheduledDate: new Date('2026-08-05T00:00:00.000Z') },
      after: { scheduledDate: new Date('2026-08-01T00:00:00.000Z') },
      reason: 'Added to service group',
      metadata: expect.objectContaining({ groupId: 'group-1', automaticDateSync: true }),
    }));
  });

  // A REJECTED appointment is explicitly groupable and is revived to
  // AWAITING_INSPECTOR on join — but the sync runs BEFORE that transition, with
  // the stale status still on the object. Adding REJECTED to a terminal-status
  // guard inside syncAppointmentScheduleToGroup would therefore stop syncing
  // exactly the appointments being revived. This test is what makes that
  // mistake fail loudly.
  it('still syncs the schedule of a REJECTED appointment being revived into the group', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({
        id: 'appt-1',
        status: 'REJECTED',
        scheduledDate: new Date('2026-08-05T00:00:00.000Z'),
        timeSlotStart: '09:30',
        timeSlotEnd: '10:30',
      }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('syncs date and time slot in a single update when both differ from the group', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({
        id: 'appt-1',
        scheduledDate: new Date('2026-08-05T00:00:00.000Z'),
        timeSlotStart: '13:00',
        timeSlotEnd: '14:00',
      }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
      metadata: expect.objectContaining({ automaticTimeSlotSync: true, automaticDateSync: true }),
    }));
  });

  it('does not update time for an ineligible appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({
        id: 'appt-1',
        serviceTypeId: 'svc-type-other',
        timeSlotStart: '13:00',
        timeSlotEnd: '14:00',
      }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-1'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([{
      appointmentId: 'appt-1',
      status: 'INVALID_SERVICE_TYPE',
      error: {
        code: 'INVALID_SERVICE_TYPE',
        message: 'Appointment service type does not match the group',
      },
    }]);
    expect(groupRepo.linkAppointments).not.toHaveBeenCalled();
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
  });

  it('keeps status transitions for DRAFT and REJECTED appointments added to the group', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-draft', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-rejected', status: 'REJECTED' }));

    const result = await useCase.execute({
      groupId: 'group-1',
      appointmentIds: ['appt-draft', 'appt-rejected'],
      actor: makeActor(),
    });

    expect(result.results).toEqual([
      { appointmentId: 'appt-draft', status: 'OK' },
      { appointmentId: 'appt-rejected', status: 'OK' },
    ]);
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-draft', 'tenant-1', { status: 'AWAITING_INSPECTOR' });
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-rejected', 'tenant-1', { status: 'AWAITING_INSPECTOR' });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.status_transition',
      actorType: 'SYSTEM',
      entityId: 'appt-draft',
      before: { status: 'DRAFT' },
      after: { status: 'AWAITING_INSPECTOR' },
    }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.status_transition',
      actorType: 'USER',
      entityId: 'appt-rejected',
      before: { status: 'REJECTED' },
      after: { status: 'AWAITING_INSPECTOR' },
    }));
  });

  // ── ACCEPTED group: members join the committed inspector ────────────────────
  describe('adding to an ACCEPTED group', () => {
    const acceptedGroup = () =>
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' });

    it('schedules the appointment under the group inspector and increments confirmed count', async () => {
      vi.mocked(groupRepo.findById).mockResolvedValue(acceptedGroup());
      // Same date/slot as the group so the schedule sync makes no update and the only
      // write asserted here is the SCHEDULED + inspector transition.
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
      );

      const result = await useCase.execute({
        groupId: 'group-1',
        appointmentIds: ['appt-1'],
        actor: makeActor(),
      });

      expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
      expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
        status: 'SCHEDULED',
        inspectorId: 'insp-1',
      });
      expect(groupRepo.incrementConfirmedCount).toHaveBeenCalledWith('group-1');
      expect(appointmentRepo.update).not.toHaveBeenCalledWith('appt-1', 'tenant-1', { status: 'AWAITING_INSPECTOR' });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'appointment.status_transition',
        actorType: 'SYSTEM',
        entityId: 'appt-1',
        before: { status: 'DRAFT' },
        after: { status: 'SCHEDULED' },
        metadata: expect.objectContaining({ groupId: 'group-1', assignedInspectorId: 'insp-1' }),
      }));
    });

    it('emits a single MEMBERS_ADDED event for only the newly added appointments', async () => {
      vi.mocked(groupRepo.findById).mockResolvedValue(acceptedGroup());
      vi.mocked(appointmentRepo.findById)
        .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT', timeSlotStart: '09:30', timeSlotEnd: '10:30' }))
        .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'AWAITING_INSPECTOR', timeSlotStart: '09:30', timeSlotEnd: '10:30' }));
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await useCase.execute({
        groupId: 'group-1',
        appointmentIds: ['appt-1', 'appt-2'],
        actor: makeActor(),
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: SERVICE_GROUP_EVENTS.MEMBERS_ADDED,
        payload: {
          groupId: 'group-1',
          inspectorId: 'insp-1',
          appointmentIds: ['appt-1', 'appt-2'],
        },
      }));
    });

    it('does not emit MEMBERS_ADDED when nothing was added to the accepted group', async () => {
      vi.mocked(groupRepo.findById).mockResolvedValue(acceptedGroup());
      // Wrong service type → rejected by the validator, never linked/scheduled.
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: 'appt-1', serviceTypeId: 'svc-type-other' }),
      );
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await useCase.execute({
        groupId: 'group-1',
        appointmentIds: ['appt-1'],
        actor: makeActor(),
      });

      expect(emitSpy).not.toHaveBeenCalled();
      expect(groupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
    });

    it('rejects an appointment when the accepted group is already at capacity (30)', async () => {
      const full = makeGroupWithAppointments(
        { status: 'ACCEPTED', assignedInspectorId: 'insp-1' },
        Array.from({ length: 30 }, (_, i) => ({
          id: `member-${i}`,
          appointmentNumber: i + 1,
          status: 'SCHEDULED',
          serviceTypeId: 'svc-type-1',
          tenantId: 'tenant-1',
          propertyId: `prop-${i}`,
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
          timeSlotStart: '09:00',
          timeSlotEnd: '12:00',
          rentalTenantConfirmationStatus: 'PENDING',
          activeConfirmationCycleId: null,
          propertyAddress: null,
          propertyCode: null,
        })),
      );
      vi.mocked(groupRepo.findById).mockResolvedValue(full);
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }),
      );

      const result = await useCase.execute({
        groupId: 'group-1',
        appointmentIds: ['appt-1'],
        actor: makeActor(),
      });

      expect(result.results).toEqual([{
        appointmentId: 'appt-1',
        status: 'GROUP_CAPACITY_EXCEEDED',
        error: {
          code: 'GROUP_CAPACITY_EXCEEDED',
          message: 'Group has reached its capacity of 30 appointments',
        },
      }]);
      expect(groupRepo.linkAppointments).not.toHaveBeenCalled();
      expect(groupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
    });
  });
});
