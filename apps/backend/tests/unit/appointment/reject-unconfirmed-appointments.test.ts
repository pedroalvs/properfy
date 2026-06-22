import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectUnconfirmedAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/reject-unconfirmed-appointments.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: 'inspector-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-05-08'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
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

function makeServiceGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'ACCEPTED',
    groupSize: 3,
    offeredCount: 3,
    confirmedCount: 3,
    scheduledDate: new Date('2026-05-08'),
    timeWindow: '09:00-12:00',
    name: null,
    regionName: null,
    description: null,
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    assignedInspectorId: 'inspector-1',
    serviceRegionId: 'region-1',
    publishedAt: new Date(),
    assignedAt: new Date(),
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function createMockRepo(): IAppointmentRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findVisibleForInspector: vi.fn(),
    isAppointmentVisibleForInspector: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    saveContact: vi.fn(),
    updateContact: vi.fn(),
    updateContactSnapshot: vi.fn(),
    deleteContactsByAppointmentId: vi.fn(),
    saveRestriction: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    findScheduledOnDate: vi.fn(),
    findAllContacts: vi.fn(),
    countContacts: vi.fn(),
    findContactById: vi.fn(),
    findDuplicateForImport: vi.fn(),
    findUnconfirmedForDate: vi.fn(),
  };
}

function createMockServiceGroupRepo(): IServiceGroupRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findAppointmentsForMapByGroupIds: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    acceptOptimistic: vi.fn(),
    findPublishedForInspector: vi.fn(),
    countPublishedForInspector: vi.fn(),
    findPublishedOfferDetail: vi.fn(),
    linkAppointments: vi.fn(),
    unlinkAppointments: vi.fn(),
    revertScheduledAppointments: vi.fn(),
    scheduleAppointments: vi.fn(),
    findExpiredPublished: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe('RejectUnconfirmedAppointmentsUseCase', () => {
  let useCase: RejectUnconfirmedAppointmentsUseCase;
  let appointmentRepo: IAppointmentRepository;
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let logger: Logger;

  beforeEach(() => {
    appointmentRepo = createMockRepo();
    serviceGroupRepo = createMockServiceGroupRepo();
    auditService = { log: vi.fn() };
    logger = createMockLogger();
    useCase = new RejectUnconfirmedAppointmentsUseCase(
      appointmentRepo, serviceGroupRepo, auditService, logger,
    );
  });

  it('should reject SCHEDULED appointment with PENDING confirmation for tomorrow', async () => {
    const appt = makeAppointment({ status: 'SCHEDULED', tenantConfirmationStatus: 'PENDING' });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      {
        status: 'REJECTED',
        reason: 'Tenant did not respond to confirmation request',
        rejectionReasonCode: 'TENANT_NO_RESPONSE',
        tenantConfirmationStatus: 'NO_RESPONSE',
        serviceGroupId: null,
      },
    );
  });

  it('should reject DRAFT appointment with PENDING confirmation for tomorrow', async () => {
    const appt = makeAppointment({ status: 'DRAFT', tenantConfirmationStatus: 'PENDING' });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ status: 'REJECTED' }),
    );
  });

  it('should reject AWAITING_INSPECTOR appointment with PENDING confirmation for tomorrow', async () => {
    const appt = makeAppointment({ status: 'AWAITING_INSPECTOR', tenantConfirmationStatus: 'PENDING' });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ status: 'REJECTED' }),
    );
  });

  it('should NOT reject appointments with CONFIRMED status (not returned by repo)', async () => {
    // The repo query already filters out CONFIRMED appointments,
    // so an empty array means no unconfirmed appointments found.
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(0);
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('should NOT affect appointments already DONE, CANCELLED, or REJECTED (not returned by repo)', async () => {
    // The repo query filters out these statuses.
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(0);
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('should remove rejected appointment from service group (serviceGroupId = null)', async () => {
    const appt = makeAppointment({
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
      serviceGroupId: 'group-1',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    // Group still has 2 other appointments after this one is removed
    const groupData: ServiceGroupWithAppointments = {
      group: makeServiceGroup(),
      appointments: [
        { id: 'appt-2', appointmentNumber: 2, status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'p-2', serviceGroupId: 'group-1', scheduledDate: new Date(), propertyAddress: 'addr', propertyCode: 'P2' },
        { id: 'appt-3', appointmentNumber: 3, status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'p-3', serviceGroupId: 'group-1', scheduledDate: new Date(), propertyAddress: 'addr', propertyCode: 'P3' },
      ],
    };
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ serviceGroupId: null }),
    );
  });

  it('should keep group open if it still has valid appointments after removal', async () => {
    const appt = makeAppointment({
      id: 'appt-1',
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
      serviceGroupId: 'group-1',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    // Group still has 2 appointments that remain linked
    const groupData: ServiceGroupWithAppointments = {
      group: makeServiceGroup(),
      appointments: [
        { id: 'appt-2', appointmentNumber: 2, status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'p-2', serviceGroupId: 'group-1', scheduledDate: new Date(), propertyAddress: 'addr', propertyCode: 'P2' },
        { id: 'appt-3', appointmentNumber: 3, status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'p-3', serviceGroupId: 'group-1', scheduledDate: new Date(), propertyAddress: 'addr', propertyCode: 'P3' },
      ],
    };
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    const result = await useCase.execute();

    expect(result.groupsUpdatedCount).toBe(1);
    expect(result.groupsClosedCount).toBe(0);
    // Group counts should be updated to reflect remaining appointments
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      offeredCount: 2,
      confirmedCount: 2,
    });
  });

  it('should cancel group when zero remaining appointments after removal', async () => {
    const appt = makeAppointment({
      id: 'appt-1',
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
      serviceGroupId: 'group-1',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    // Group has zero remaining appointments (all were removed)
    const groupData: ServiceGroupWithAppointments = {
      group: makeServiceGroup(),
      appointments: [],
    };
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    const result = await useCase.execute();

    expect(result.groupsClosedCount).toBe(1);
    expect(result.groupsUpdatedCount).toBe(0);
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      status: 'CANCELLED',
    });
  });

  it('should create audit log entries for each rejected appointment', async () => {
    const appt = makeAppointment({
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
      serviceGroupId: 'group-1',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue({
      group: makeServiceGroup(),
      appointments: [],
    });

    await useCase.execute();

    // Audit log for the appointment rejection
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.status_transition',
        actorType: 'SYSTEM',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
        before: expect.objectContaining({ status: 'SCHEDULED' }),
        after: expect.objectContaining({
          status: 'REJECTED',
          tenantConfirmationStatus: 'NO_RESPONSE',
          rejectionReasonCode: 'TENANT_NO_RESPONSE',
        }),
        reason: 'Tenant did not respond to confirmation request',
        metadata: { trigger: 'daily_unconfirmed_cleanup' },
      }),
    );

    // Audit log for the group cancellation
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.cancelled',
        actorType: 'SYSTEM',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        reason: 'All appointments removed due to non-response cleanup',
      }),
    );
  });

  it('should handle multiple appointments in different groups', async () => {
    const appt1 = makeAppointment({
      id: 'appt-1',
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
      serviceGroupId: 'group-1',
    });
    const appt2 = makeAppointment({
      id: 'appt-2',
      status: 'AWAITING_INSPECTOR',
      tenantConfirmationStatus: 'UNAVAILABLE',
      serviceGroupId: 'group-2',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt1, appt2]);

    // group-1 has remaining appointments
    vi.mocked(serviceGroupRepo.findById).mockImplementation(async (id) => {
      if (id === 'group-1') {
        return {
          group: makeServiceGroup({ id: 'group-1' }),
          appointments: [
            { id: 'appt-remaining', appointmentNumber: 5, status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'p-5', serviceGroupId: 'group-1', scheduledDate: new Date(), propertyAddress: 'addr', propertyCode: 'P5' },
          ],
        };
      }
      // group-2 has no remaining appointments
      return {
        group: makeServiceGroup({ id: 'group-2' }),
        appointments: [],
      };
    });

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(2);
    expect(result.groupsUpdatedCount).toBe(1); // group-1
    expect(result.groupsClosedCount).toBe(1); // group-2
  });

  it('should return zeros when no unconfirmed appointments are found', async () => {
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({
      rejectedCount: 0,
      groupsClosedCount: 0,
      groupsUpdatedCount: 0,
    });
  });

  it('should continue processing other appointments when one fails', async () => {
    const appt1 = makeAppointment({
      id: 'appt-1',
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
    });
    const appt2 = makeAppointment({
      id: 'appt-2',
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'PENDING',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt1, appt2]);

    // First update fails, second succeeds
    vi.mocked(appointmentRepo.update)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-1' }),
      'Failed to reject unconfirmed appointment',
    );
  });

  it('should handle appointments with UNAVAILABLE confirmation status', async () => {
    const appt = makeAppointment({
      status: 'SCHEDULED',
      tenantConfirmationStatus: 'UNAVAILABLE',
    });
    vi.mocked(appointmentRepo.findUnconfirmedForDate).mockResolvedValue([appt]);

    const result = await useCase.execute();

    expect(result.rejectedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        status: 'REJECTED',
        tenantConfirmationStatus: 'NO_RESPONSE',
      }),
    );
  });
});
