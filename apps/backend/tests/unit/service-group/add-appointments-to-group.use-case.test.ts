import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { AddAppointmentsToGroupUseCase } from '../../../src/modules/service-group/application/use-cases/add-appointments-to-group.use-case';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
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
  let useCase: AddAppointmentsToGroupUseCase;

  beforeEach(() => {
    groupRepo = {
      findById: vi.fn().mockResolvedValue(makeGroupWithAppointments()),
      linkAppointments: vi.fn(),
    } as unknown as IServiceGroupRepository;
    appointmentRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    } as unknown as IAppointmentRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new AddAppointmentsToGroupUseCase(
      groupRepo,
      appointmentRepo,
      auditService,
      new AuthorizationService(auditService),
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
});
